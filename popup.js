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

function sanitizeUrl(url) {
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol === 'chrome-extension:') {
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

function updateLanguageSelectDisplay() {
    const languageSelect = document.getElementById('languageSelect');
    const selectedOption = languageSelect.options[languageSelect.selectedIndex];
    
    // Store full text in data attribute if not already stored
    if (!selectedOption.dataset.fullText) {
        Array.from(languageSelect.options).forEach(option => {
            option.dataset.fullText = option.text;
            // Extract ISO code (first 2 characters after emoji)
            const match = option.text.match(/🇦🇹|🇧🇪|🇧🇬|🇭🇷|🇨🇾|🇨🇿|🇩🇰|🇪🇪|🇫🇮|🇫🇷|🇩🇪|🇬🇷|🇭🇺|🇮🇪|🇮🇹|🇱🇻|🇱🇹|🇱🇺|🇲🇹|🇳🇱|🇵🇱|🇵🇹|🇷🇴|🇸🇰|🇸🇮|🇪🇸|🇸🇪|🇬🇧/);
            const emoji = match ? match[0] : '';
            const isoCode = option.value;
            option.dataset.shortText = `${emoji} ${isoCode}`;
        });
    }
    
    // Show short version in closed dropdown
    Array.from(languageSelect.options).forEach(option => {
        option.text = option.dataset.shortText;
    });
}

// Show full names when dropdown opens
function showFullLanguageNames() {
    const languageSelect = document.getElementById('languageSelect');
    Array.from(languageSelect.options).forEach(option => {
        if (option.dataset.fullText) {
            option.text = option.dataset.fullText;
        }
    });
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
    
    for (const url of urls) {
        try {
            const adjustedUrl = adjustUrlLanguage(url);
            resultElement.innerText += `\nProcessing: ${adjustedUrl}`;
            await new Promise(r => setTimeout(r, 500));

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
            resultElement.innerText += `\nError processing ${url}`;
        }
    }
}

async function handleMainUrlAction(url, action) {
    const resultElement = document.getElementById('result');
    
    try {
        const parsedUrl = new URL(url);
        
        if (!parsedUrl.hostname.includes('europarl.europa.eu')) {
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
        resultElement.innerText = `Error occurred while ${action}ing PDFs. Check the console for details.`;
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

    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname.includes('europarl.europa.eu')) {
            urlInput.style.border = '2px solid green';
        } else {
            urlInput.style.border = '2px solid red';
        }
    } catch (e) {
        urlInput.style.border = '2px solid red';
    }
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
        if (data.selectedLanguage !== undefined) {
            languageSelect.value = data.selectedLanguage;
        }
    });

    filterCheckbox.addEventListener('change', () => {
        chrome.storage.local.set({ filterCheckboxState: filterCheckbox.checked });
    });
    
    languageSelect.addEventListener('change', () => {
        chrome.storage.local.set({ selectedLanguage: languageSelect.value });
        // Language is now visible in the dropdown itself, no need for separate display
        updateLanguageSelectDisplay();
    });
    
    // Add event listeners for dropdown behavior
    languageSelect.addEventListener('focus', showFullLanguageNames);
    languageSelect.addEventListener('mousedown', showFullLanguageNames);
    languageSelect.addEventListener('blur', updateLanguageSelectDisplay);
    languageSelect.addEventListener('change', updateLanguageSelectDisplay);

    // Initialize icon click handler
    const icon = document.getElementById('icon');
    if (icon) {
        icon.addEventListener('click', () => {
            window.open('https://partei-des-fortschritts.de/', '_blank');
        });
    }

    // Validate initial URL
    validateUrlInput();
    
    // Initialize language select display
    updateLanguageSelectDisplay();

    // Check for result element
    const resultElement = document.getElementById('result');
    if (!resultElement) {
        console.error('Error: The result element is not found in the DOM.');
    }
});