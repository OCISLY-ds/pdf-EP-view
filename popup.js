// ========== UTILITY FUNCTIONS ==========

function showConfirmationDialog(count) {
    return new Promise((resolve) => {
        const confirmationElement = document.getElementById('animatedConfirmation');
        const confirmationMessage = document.getElementById('confirmationMessage');
        const proceedButton = document.getElementById('proceedButton');
        const cancelButton = document.getElementById('cancelButton');

        confirmationMessage.innerText = `Warning: You are about to process ${count} documents. Do you want to continue?`;
        confirmationElement.style.display = 'block';

        const cleanup = (result) => {
            confirmationElement.style.display = 'none';
            resolve(result);
        };

        proceedButton.onclick = () => cleanup(true);
        cancelButton.onclick = () => cleanup(false);
    });
}

async function getCurrentTabUrl() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(tabs[0]?.url || '');
            }
        });
    });
}

// Exact host match. A substring check would also accept e.g. europarl.europa.eu.evil.com.
function isEpUrl(url) {
    try {
        const { protocol, hostname } = new URL(url);
        return protocol === 'https:' &&
            (hostname === 'europarl.europa.eu' || hostname.endsWith('.europarl.europa.eu'));
    } catch (e) {
        return false;
    }
}

// Only EP links are allowed through, so a manipulated page cannot make us open or download from other hosts.
function sanitizeUrl(url) {
    try {
        const parsedUrl = new URL(url);
        if (!isEpUrl(parsedUrl.href)) {
            return '';
        }
        return parsedUrl.href;
    } catch (e) {
        console.error('Invalid URL:', url);
        return '';
    }
}

function showError(message) {
    const resultElement = document.getElementById('result');
    resultElement.innerText = message;
    resultElement.classList.add('error');
}

function clearError() {
    const resultElement = document.getElementById('result');
    resultElement.classList.remove('error');
}

function updateLanguageDisplay() {
    // Language display is now handled by the dropdown itself
    // No need to show it in the result area
}

// ========== LANGUAGE PICKER ==========
// A native <select> cannot show images, so the visible control is a custom dropdown with SVG flags
// (flags/*.svg from the npm package country-flag-icons). The hidden <select id="languageSelect">
// stays the single source of truth: its .value is what the rest of this file reads.

// EP language code -> flag file in flags/ (ISO country code; EN -> GB, GA -> IE, ...)
const LANGUAGE_FLAGS = {
    BG: 'bg', CS: 'cz', DA: 'dk', DE: 'de', EL: 'gr', EN: 'gb', ES: 'es', ET: 'ee',
    FI: 'fi', FR: 'fr', GA: 'ie', HR: 'hr', HU: 'hu', IT: 'it', LT: 'lt', LV: 'lv',
    MT: 'mt', NL: 'nl', PL: 'pl', PT: 'pt', RO: 'ro', SK: 'sk', SL: 'si', SV: 'se'
};

function flagUrl(languageCode) {
    return `flags/${LANGUAGE_FLAGS[languageCode]}.svg`;
}

function renderLanguageButton() {
    const code = document.getElementById('languageSelect').value;
    document.getElementById('languageFlag').src = flagUrl(code);
    document.getElementById('languageCode').textContent = code;
}

// The list is built on first open, so the 23 other flags are only loaded when needed.
function buildLanguageList() {
    const list = document.getElementById('languageList');
    if (list.childElementCount) return;

    Array.from(document.getElementById('languageSelect').options).forEach(option => {
        const item = document.createElement('li');
        item.setAttribute('role', 'option');
        item.tabIndex = -1;
        item.dataset.value = option.value;

        const flag = document.createElement('img');
        flag.className = 'flag';
        flag.alt = '';
        flag.width = 20;
        flag.height = 15;
        flag.src = flagUrl(option.value);

        item.append(flag, option.text);
        list.appendChild(item);
    });
}

function openLanguageList() {
    buildLanguageList();
    const current = document.getElementById('languageSelect').value;
    const items = Array.from(document.getElementById('languageList').children);
    items.forEach(item => item.setAttribute('aria-selected', String(item.dataset.value === current)));

    document.getElementById('languageList').hidden = false;
    document.getElementById('languageButton').setAttribute('aria-expanded', 'true');
    (items.find(item => item.dataset.value === current) || items[0]).focus();
}

function closeLanguageList({ refocus = false } = {}) {
    document.getElementById('languageList').hidden = true;
    const button = document.getElementById('languageButton');
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
}

function selectLanguage(code) {
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect.value !== code) {
        languageSelect.value = code;
        languageSelect.dispatchEvent(new Event('change'));
    }
    closeLanguageList({ refocus: true });
}

function initLanguagePicker() {
    const button = document.getElementById('languageButton');
    const list = document.getElementById('languageList');

    button.addEventListener('click', () => (list.hidden ? openLanguageList() : closeLanguageList()));
    button.addEventListener('keydown', (e) => {
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.hidden) {
            e.preventDefault();
            openLanguageList();
        }
    });

    list.addEventListener('click', (e) => {
        const item = e.target.closest('li');
        if (item) selectLanguage(item.dataset.value);
    });
    list.addEventListener('keydown', (e) => {
        const items = Array.from(list.children);
        const index = items.indexOf(document.activeElement);
        const focusItem = (i) => items[Math.max(0, Math.min(items.length - 1, i))].focus();

        if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(index + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(index - 1); }
        else if (e.key === 'Home') { e.preventDefault(); focusItem(0); }
        else if (e.key === 'End') { e.preventDefault(); focusItem(items.length - 1); }
        else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (index >= 0) selectLanguage(items[index].dataset.value);
        }
        else if (e.key === 'Escape') { e.preventDefault(); closeLanguageList({ refocus: true }); }
        else if (e.key === 'Tab') closeLanguageList();
    });

    document.addEventListener('click', (e) => {
        if (!list.hidden && !e.target.closest('.language-picker')) closeLanguageList();
    });

    renderLanguageButton();
}

function filterPdfLinks(pdfLinks) {
    const filterCheckbox = document.getElementById('filterCheckbox');
    const languageSelect = document.getElementById('languageSelect');
    const selectedLanguage = languageSelect ? languageSelect.value : 'EN';
    
    // If the checkbox is checked, the filter should not be activated
    if (filterCheckbox && filterCheckbox.checked) return pdfLinks;

    return pdfLinks.filter(link => {
        const fileName = link.split('/').pop();
        // Match exactly 3 digits before _{LANGUAGE}.pdf and exclude links with more than 3 digits
        const isExactly3Digits = new RegExp(`-\\d{3}_${selectedLanguage}\\.pdf$`).test(fileName);
        const isMoreThan3Digits = new RegExp(`-\\d{4,}_${selectedLanguage}\\.pdf$`).test(fileName);
        return isExactly3Digits && !isMoreThan3Digits;
    });
}

// ========== DOCUMENT NUMBER PROCESSING ==========

function parseDocumentNumbers(docNumberInput) {
    const docNumber = docNumberInput.trim();
    if (!docNumber) return [];

    return docNumber.split(',').map(n => n.trim()).filter(n => n.length > 0);
}

function convertDocNumberToUrl(docNumber) {
    const baseUrl = 'https://www.europarl.europa.eu/doceo/document/';
    const languageSelect = document.getElementById('languageSelect');
    const selectedLanguage = languageSelect ? languageSelect.value : 'EN';
    
    // Standard format: A10-0044/2025
    const standardMatch = docNumber.match(/^([A-Z])(\d+)-(\d+)\/(\d{4})$/);
    if (standardMatch) {
        const [_, prefixLetter, prefixNumber, docNum, year] = standardMatch;
        return `${baseUrl}${prefixLetter}-${prefixNumber}-${year}-${docNum.padStart(4,'0')}_${selectedLanguage}.html`;
    }
    
    // Extended format: RC-B10-0324/2025/REV1 or RC-B10-0324/2025
    const extendedMatch = docNumber.match(/^([A-Z]{1,3})-([A-Z])(\d+)-(\d+)\/(\d{4})(?:\/REV\d+)?$/);
    if (extendedMatch) {
        const [_, prefix, middleLetter, middleNumber, docNum, year] = extendedMatch;
        // For RC documents, use only the middle number (10 from B10) and selected language
        return `${baseUrl}${prefix}-${middleNumber}-${year}-${docNum.padStart(4,'0')}_${selectedLanguage}.html`;
    }
    
    throw new Error(`Invalid document number format: ${docNumber}. Use format A10-0044/2025 or RC-B10-0324/2025(/REV1)`);
}

function convertDocNumbersToUrls(docNumbers) {
    const urls = [];
    
    for (const docNumber of docNumbers) {
        try {
            urls.push(convertDocNumberToUrl(docNumber));
        } catch (error) {
            alert(error.message);
            return null; // Signal error
        }
    }
    
    return urls;
}

// ========== PDF PROCESSING ==========

function adjustUrlLanguage(url) {
    const languageSelect = document.getElementById('languageSelect');
    const selectedLanguage = languageSelect ? languageSelect.value : 'EN';
    
    // Check if URL contains language code pattern like _EN.html, _DE.html, etc.
    const languagePattern = /_[A-Z]{2}\.html/;
    
    if (languagePattern.test(url)) {
        // Replace existing language code with selected language
        return url.replace(languagePattern, `_${selectedLanguage}.html`);
    }
    
    // If no language pattern found, return original URL
    return url;
}

async function fetchPdfLinksFromUrl(url) {
    try {
        // Adjust URL language before fetching
        const adjustedUrl = adjustUrlLanguage(url);
        
        const response = await fetch(adjustedUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');

        const pdfLinks = Array.from(doc.querySelectorAll('a[href$=".pdf"]')).map(a => {
            const href = a.getAttribute('href');
            try {
                return sanitizeUrl(new URL(href, adjustedUrl).href);
            } catch (e) {
                console.warn('Failed to resolve link:', href);
                return '';
            }
        }).filter(link => link);

        return filterPdfLinks(pdfLinks);
    } catch (error) {
        console.error('Error fetching PDF links:', error);
        throw error;
    }
}

async function processUrlsForAction(urls, action) {
    const resultElement = document.getElementById('result');
    clearError();
    resultElement.innerText = `Processing ${urls.length} document(s)...`;

    for (const [index, url] of urls.entries()) {
        try {
            const adjustedUrl = adjustUrlLanguage(url);
            resultElement.innerText += `\nProcessing: ${adjustedUrl}`;
            if (index > 0) await new Promise(r => setTimeout(r, 500)); // be gentle with the EP server

            const filteredLinks = await fetchPdfLinksFromUrl(url);
            
            if (filteredLinks.length > 5) {
                const proceed = await showConfirmationDialog(filteredLinks.length);
                if (!proceed) {
                    resultElement.innerText += `\nSkipped: ${adjustedUrl}`;
                    continue;
                }
            }
            
            if (filteredLinks.length === 0) {
                resultElement.innerText += `\nNo PDF links found at ${adjustedUrl}`;
                continue;
            }
            
            resultElement.innerText += `\n${action === 'open' ? 'Opening' : 'Downloading'} ${filteredLinks.length} PDF(s)...`;
            
            if (action === 'open') {
                filteredLinks.forEach(link => chrome.tabs.create({ url: link }));
            } else {
                filteredLinks.forEach((link, idx) => {
                    const a = document.createElement('a');
                    a.href = link;
                    a.download = `doc_${idx + 1}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                });
            }
        } catch (error) {
            console.error(`Error processing ${url}:`, error);
            resultElement.innerText += `\nError processing ${url}: ${error.message}`;
        }
    }
}

async function handleMainUrlAction(url, action) {
    const resultElement = document.getElementById('result');
    clearError();

    try {
        if (!isEpUrl(url)) {
            showError('Error: This feature only works for URLs on the www.europarl.europa.eu domain.');
            return;
        }

        const filteredLinks = await fetchPdfLinksFromUrl(url);

        if (filteredLinks.length > 5) {
            const proceed = await showConfirmationDialog(filteredLinks.length);
            if (!proceed) {
                resultElement.innerText = 'Operation cancelled by user.';
                return;
            }
        }

        if (filteredLinks.length === 0) {
            resultElement.innerText = action === 'open' ? 'No PDF links found.' : 'No PDF links available to download.';
            return;
        }

        if (action === 'open') {
            filteredLinks.forEach(link => chrome.tabs.create({ url: link }));
            resultElement.innerText = `Opened ${filteredLinks.length} PDF(s).`;
        } else {
            resultElement.innerText = `Found ${filteredLinks.length} PDF(s). Preparing to download...`;
            await new Promise(resolve => setTimeout(resolve, 25));
            resultElement.innerText = `Downloading ${filteredLinks.length} PDF(s)...`;
            
            filteredLinks.forEach((link, index) => {
                const a = document.createElement('a');
                a.href = link;
                a.download = `document_${index + 1}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
            
            resultElement.innerText = 'All PDFs downloaded successfully.';
        }
    } catch (error) {
        console.error(`Error ${action}ing PDFs:`, error);
        showError(`Error while ${action}ing PDFs: ${error.message}`);
    }
}

// ========== EVENT HANDLERS ==========

document.getElementById('fetchButton').addEventListener('click', async () => {
    const urlInput = document.getElementById('urlInput');
    const docNumberInput = document.getElementById('docNumberInput');
    const docNumber = docNumberInput.value.trim();

    let url = urlInput.value || await getCurrentTabUrl();

    // Handle document numbers
    if (docNumber) {
        const docNumbers = parseDocumentNumbers(docNumber);
        const urls = convertDocNumbersToUrls(docNumbers);
        
        if (!urls) return; // Error occurred in conversion
        
        if (urls.length > 5) {
            const proceed = await showConfirmationDialog(urls.length);
            if (!proceed) {
                document.getElementById('result').innerText = 'Operation cancelled by user.';
                return;
            }
        }
        
        await processUrlsForAction(urls, 'open');
        return;
    }

    // Handle single URL
    if (!url) {
        alert('Please enter a URL or document number, or use the extension on an open tab.');
        return;
    }

    await handleMainUrlAction(url, 'open');
});

document.getElementById('downloadAllButton').addEventListener('click', async () => {
    const urlInput = document.getElementById('urlInput');
    const docNumberInput = document.getElementById('docNumberInput');
    const docNumber = docNumberInput.value.trim();

    let url = urlInput.value || await getCurrentTabUrl();

    // Handle document numbers
    if (docNumber) {
        const docNumbers = parseDocumentNumbers(docNumber);
        const urls = convertDocNumbersToUrls(docNumbers);
        
        if (!urls) return; // Error occurred in conversion
        
        if (urls.length > 5) {
            const proceed = await showConfirmationDialog(urls.length);
            if (!proceed) {
                document.getElementById('result').innerText = 'Operation cancelled by user.';
                return;
            }
        }
        
        await processUrlsForAction(urls, 'download');
        return;
    }

    // Handle single URL
    if (!url) {
        alert('Please enter a URL or document number, or use the extension on an open tab.');
        return;
    }

    await handleMainUrlAction(url, 'download');
});

// ========== VALIDATION AND INITIALIZATION ==========

function validateUrlInput() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();

    urlInput.style.border = isEpUrl(url) ? '2px solid green' : '2px solid red';
}

// ========== DOM EVENT LISTENERS ==========

document.getElementById('urlInput').addEventListener('input', validateUrlInput);

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize URL input
    const urlInput = document.getElementById('urlInput');
    try {
        const currentTabUrl = await getCurrentTabUrl();
        urlInput.value = currentTabUrl;
    } catch (e) {
        console.error('Could not get current tab URL:', e);
        urlInput.value = 'https://www.europarl.europa.eu/portal/en';
    }

    // Initialize version display
    const versionLabel = document.getElementById('extensionVersion');
    if (versionLabel) {
        const manifestData = chrome.runtime.getManifest();
        versionLabel.innerText = `Version: ${manifestData.version}`;
    }

    // Initialize filter checkbox and language selection
    const filterCheckbox = document.getElementById('filterCheckbox');
    const languageSelect = document.getElementById('languageSelect');
    
    chrome.storage.local.get(['filterCheckboxState', 'selectedLanguage'], (data) => {
        if (data.filterCheckboxState !== undefined) {
            filterCheckbox.checked = data.filterCheckboxState;
        }
        if (LANGUAGE_FLAGS[data.selectedLanguage]) {
            languageSelect.value = data.selectedLanguage;
            renderLanguageButton();
        }
    });

    filterCheckbox.addEventListener('change', () => {
        chrome.storage.local.set({ filterCheckboxState: filterCheckbox.checked });
    });
    
    languageSelect.addEventListener('change', () => {
        chrome.storage.local.set({ selectedLanguage: languageSelect.value });
        renderLanguageButton();
    });
    
    // Initialize icon click handler
    const icon = document.getElementById('icon');
    if (icon) {
        icon.addEventListener('click', () => {
            window.open('https://partei-des-fortschritts.de/', '_blank');
        });
    }

    // Validate initial URL
    validateUrlInput();
    
    // Initialize language picker
    initLanguagePicker();

    // Check for result element
    const resultElement = document.getElementById('result');
    if (!resultElement) {
        console.error('Error: The result element is not found in the DOM.');
    }
});