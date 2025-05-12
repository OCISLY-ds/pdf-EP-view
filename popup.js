function showConfirmationDialog(count) {
    return new Promise((resolve, reject) => {
        const confirmationElement = document.getElementById('animatedConfirmation');
        const confirmationMessage = document.getElementById('confirmationMessage');
        const proceedButton = document.getElementById('proceedButton');
        const cancelButton = document.getElementById('cancelButton');

        confirmationMessage.innerText = `Warning: You are about to process ${count} documents. Do you want to continue?`;
        confirmationElement.style.display = 'block';

        proceedButton.onclick = () => {
            confirmationElement.style.display = 'none';
            resolve(true);
        };

        cancelButton.onclick = () => {
            confirmationElement.style.display = 'none';
            resolve(false);
        };
    });
}

document.getElementById('fetchButton').addEventListener('click', async () => {
    const urlInput = document.getElementById('urlInput');
    const docNumberInput = document.getElementById('docNumberInput');
    const docNumber = docNumberInput.value.trim();

    let url = urlInput.value || await getCurrentTabUrl();

    if (docNumber) {
        const docNumbers = docNumber.split(',').map(n => n.trim()).filter(n => n.length > 0);
        const baseUrl = 'https://www.europarl.europa.eu/doceo/document/';
        const urls = [];

        for (const dn of docNumbers) {
            const match = dn.match(/^([A-Z])\d+-\d{4}\/\d+$/);
            if (match) {
                const formattedUrl = `${baseUrl}${dn.replace('/', '-')}_EN.html`;
                urls.push(formattedUrl);
            } else {
                alert(`Invalid document number format: ${dn}. Use format A10-0044/2025`);
                return;
            }
        }

        if (urls.length > 5) {
            const proceed = await showConfirmationDialog(urls.length);
            if (!proceed) {
                document.getElementById('result').innerText = 'Operation cancelled by user.';
                return;
            }
        }

        for (const singleUrl of urls) {
            const response = await fetch(singleUrl);
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            const pdfLinks = Array.from(doc.querySelectorAll('a[href$=".pdf"]')).map(a => {
                const href = a.getAttribute('href');
                try {
                    return new URL(href, singleUrl).href;
                } catch (e) {
                    console.warn('Failed to resolve link:', href);
                    return '';
                }
            }).filter(link => link);

            const filteredLinks = filterPdfLinks(pdfLinks);

            if (filteredLinks.length === 0) {
                console.warn(`No PDF links found at ${singleUrl}`);
                continue;
            }

            filteredLinks.forEach((link) => {
                chrome.tabs.create({ url: link });
            });
        }

        return;
    }

    if (!url) {
        alert('Please enter a URL or document number, or use the extension on an open tab.');
        return;
    }

    try {
        const parsedUrl = new URL(url);
        const resultElement = document.getElementById('result');

        if (!parsedUrl.hostname.includes('europarl.europa.eu')) {
            showError('Error: This feature only works for URLs on the www.europarl.europa.eu domain.');
            return;
        }

        const response = await fetch(url);
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');

        const pdfLinks = Array.from(doc.querySelectorAll('a[href$=".pdf"]')).map(a => {
            const href = a.getAttribute('href');
            try {
                return new URL(href, url).href;
            } catch (e) {
                console.warn('Failed to resolve link:', href);
                return '';
            }
        }).filter(link => link);

        const filteredLinks = filterPdfLinks(pdfLinks);

        if (filteredLinks.length > 5) {
            const proceed = await showConfirmationDialog(filteredLinks.length);
            if (!proceed) {
                resultElement.innerText = 'Operation cancelled by user.';
                return;
            }
        }

        if (filteredLinks.length === 0) {
            resultElement.innerText = 'No PDF links found.';
        } else {
            filteredLinks.forEach((link) => {
                chrome.tabs.create({ url: link });
            });
        }

    } catch (error) {
        console.error('Error opening URLs:', error);
        document.getElementById('result').innerText = 'Error occurred. Check the console for details.';
    }
});

document.getElementById('downloadAllButton').addEventListener('click', async () => {
    const resultElement = document.getElementById('result');

    try {
        const urlInput = document.getElementById('urlInput');
        const docNumberInput = document.getElementById('docNumberInput');
        const docNumber = docNumberInput.value.trim();

        let url = urlInput.value || await getCurrentTabUrl();

        if (docNumber) {
            const docNumbers = docNumber.split(',').map(n => n.trim()).filter(n => n.length > 0);
            const baseUrl = 'https://www.europarl.europa.eu/doceo/document/';
            const urls = [];

            for (const dn of docNumbers) {
                const match = dn.match(/^([A-Z])(\d+)-(\d{4})\/(\d+)$/);
                if (match) {
                    const [_, prefixLetter, prefixNumber, year, number] = match;
                    const formattedUrl = `${baseUrl}A-${prefixNumber}-${number.padStart(4, '0')}-${year}_EN.html`;
                    urls.push(formattedUrl);
                } else {
                    alert(`Invalid document number format: ${dn}. Use format A10-0044/2025`);
                    return;
                }
            }

            if (urls.length > 5) {
                const proceed = await showConfirmationDialog(urls.length);
                if (!proceed) {
                    resultElement.innerText = 'Operation cancelled by user.';
                    return;
                }
            }

            for (const singleUrl of urls) {
                url = singleUrl;
                urlInput.value = url;
                resultElement.innerText += `\nProcessing: ${url}`;
                await new Promise(resolve => setTimeout(resolve, 1000));

                const response = await fetch(url);
                const text = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');

                const pdfLinks = Array.from(doc.querySelectorAll('a[href$=".pdf"]')).map(a => {
                    const href = a.getAttribute('href');
                    try {
                        const resolved = new URL(href, url).href;
                        return sanitizeUrl(resolved);
                    } catch (e) {
                        console.warn('Failed to resolve link:', href);
                        return '';
                    }
                }).filter(link => link);

                const filteredLinks = filterPdfLinks(pdfLinks);

                if (filteredLinks.length === 0) {
                    resultElement.innerText += `\nNo PDF links found at ${url}`;
                    continue;
                }

                resultElement.innerText += `\nDownloading ${filteredLinks.length} PDF(s) from ${url}...`;

                filteredLinks.forEach((link, index) => {
                    const a = document.createElement('a');
                    a.href = link;
                    a.download = `document_${index + 1}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                });
            }

            resultElement.innerText += '\nAll PDFs downloaded.';
            return;
        }

        if (!url) {
            alert('Please enter a URL or document number, or use the extension on an open tab.');
            return;
        }

        const response = await fetch(url);
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');

        const pdfLinks = Array.from(doc.querySelectorAll('a[href$=".pdf"]')).map(a => {
            const href = a.getAttribute('href');
            try {
                const resolved = new URL(href, url).href;
                return sanitizeUrl(resolved);
            } catch (e) {
                console.warn('Failed to resolve link:', href);
                return '';
            }
        }).filter(link => link);

        const filteredLinks = filterPdfLinks(pdfLinks);

        if (filteredLinks.length > 5) {
            const proceed = await showConfirmationDialog(filteredLinks.length);
            if (!proceed) {
                resultElement.innerText = 'Operation cancelled by user.';
                return;
            }
        }

        if (filteredLinks.length === 0) {
            resultElement.innerText = 'No PDF links available to download.';
            return;
        }

        resultElement.innerText = `Found ${filteredLinks.length} PDF(s). Preparing to download...`;

        // Wait for 2 seconds before proceeding
        await new Promise(resolve => setTimeout(resolve, 1000));

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
    } catch (error) {
        console.error('Error downloading PDFs:', error);
        resultElement.innerText = 'Error occurred while downloading PDFs. Check the console for details.';
    }
});

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

document.getElementById('urlInput').addEventListener('input', validateUrlInput);
document.addEventListener('DOMContentLoaded', async () => {
    const urlInput = document.getElementById('urlInput');
    try {
        const currentTabUrl = await getCurrentTabUrl();
        urlInput.value = currentTabUrl;
    } catch (e) {
        console.error('Could not get current tab URL:', e);
        urlInput.value = 'https://www.europarl.europa.eu/portal/en'; // Fallback URL
    }

    const versionLabel = document.getElementById('extensionVersion');
    if (versionLabel) {
        const manifestData = chrome.runtime.getManifest();
        versionLabel.innerText = `Version: ${manifestData.version}`;
    }

    validateUrlInput();
});

document.addEventListener('DOMContentLoaded', () => {
    const icon = document.getElementById('icon');
    if (icon) {
        icon.addEventListener('click', () => {
            window.open('https://partei-des-fortschritts.de/', '_blank');
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const filterCheckbox = document.getElementById('filterCheckbox');

    // Load the saved state of the checkbox
    chrome.storage.local.get(['filterCheckboxState'], (data) => {
        if (data.filterCheckboxState !== undefined) {
            filterCheckbox.checked = data.filterCheckboxState;
        }
    });

    // Save the state of the checkbox whenever it changes
    filterCheckbox.addEventListener('change', () => {
        chrome.storage.local.set({ filterCheckboxState: filterCheckbox.checked });
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const resultElement = document.getElementById('result');
    if (!resultElement) {
        console.error('Error: The result element is not found in the DOM.');
    }
});

function filterPdfLinks(pdfLinks) {
    const filterCheckbox = document.getElementById('filterCheckbox');
    // If the checkbox is checked, the filter should not be activated
    if (filterCheckbox && filterCheckbox.checked) return pdfLinks;

    return pdfLinks.filter(link => {
        const fileName = link.split('/').pop();
        // Match exactly 3 digits before _EN.pdf and exclude links with more than 3 digits before _EN.pdf
        const isExactly3Digits = /-\d{3}_EN\.pdf$/.test(fileName);
        const isMoreThan3Digits = /-\d{4,}_EN\.pdf$/.test(fileName);
        return isExactly3Digits && !isMoreThan3Digits;
    });
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