# 🗂️ Automated Download of EP Plenary Amendments

<img width="640" alt="image" src="https://github.com/user-attachments/assets/ac58f6e0-f5f5-47a4-b92b-6e729462b3c6" />

A simple and powerful Chrome Extension that allows you to extract and download all PDF documents from EU Parliament pages by entering official **document IDs or direct URLs**.

---

## 🚀 Features

- 🎯 **Input official document numbers** like `A10-0044/2025` (single or comma-separated)
- 🔗 Automatically converts them to the correct URL format, e.g.  
  `https://www.europarl.europa.eu/doceo/document/A-10-2025-0044_EN.html`
- The second Option is to use the current Tab
  - Note: This feature will only work on [the official EP Plenary Session Website](https://www.europarl.europa.eu/plenary/en/home.html)
- 📄 Scrapes and opens or downloads all PDF documents found on that page
- ✅ Optional filter: Download the Reports (eg everything + the Amendments) 
- ⚠️ **Warning popup** if more than 5 documents are to be processed – user must confirm
- 💾 Filter checkbox state is stored locally
---
Watch an example usage here:

https://github.com/user-attachments/assets/7640db70-7ace-4b90-abe7-8571c1d9ad9b

## 🗳️ Related

Want to see how MEPs actually voted? Check out **[check-some-votes.eu](https://check-some-votes.eu)**: roll-call votes and plenary speeches of all MEPs.

## 🧰 Development

The SVG flags in `flags/` are not part of the repository. After cloning, run this once (needs `curl`, `tar` and `openssl`):

```bash
scripts/fetch-flags.sh
```

Then load the folder in `chrome://extensions` via **Load unpacked**.

## 🛠️ Installation

Add the Extension to your Chrome Browser with this Link: 
https://chromewebstore.google.com/detail/pdf-link-opener-for-the-e/iihjjcgaglipkaojpekidiahmopdancl?authuser=0&hl=de
