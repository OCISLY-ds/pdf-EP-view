// Content script to inject a "Download all amendments" button on EP Doceo pages
(function () {
  const STATE = {
    inserted: false,
    selectedLanguage: 'EN',
    filterCheckboxState: undefined, // when true, do NOT filter (keep all)
    includeReports: false,
  };

  // Load user preferences (selected language + filter state)
  try {
    chrome.storage?.local?.get(['selectedLanguage', 'filterCheckboxState', 'includeReports'], (data) => {
      if (data && typeof data.selectedLanguage === 'string') {
        STATE.selectedLanguage = data.selectedLanguage;
      }
      if (typeof data?.filterCheckboxState !== 'undefined') {
        STATE.filterCheckboxState = !!data.filterCheckboxState;
      }
      if (typeof data?.includeReports !== 'undefined') {
        STATE.includeReports = !!data.includeReports;
      }
    });
  } catch (_) {
    // fail silently if storage is not accessible
  }

  // Utility: determine whether an element is visible
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  // Suche den oberen Flex-Container (mit OEIL-Procedure-Link) und setze den Button darüber
  function findTopProcedureContainer() {
    // Robust: an OEIL-Procedure-Link ankern
    const oeilLink = document.querySelector('a[href*="oeil.secure.europarl.europa.eu/oeil/popups/ficheprocedure.do"]');
    if (oeilLink) {
      const flex = oeilLink.closest('div.d-flex.justify-content-between.flex-wrap');
      if (flex && isVisible(flex)) return flex;
    }

    // Fallback: rechte Spalte mit "Document stages in plenary" (EN)
    const stages = Array.from(document.querySelectorAll('div.text-muted'))
      .find((el) => /document stages in plenary/i.test(el.textContent || ''));
    if (stages) {
      const flex = stages.closest('div.d-flex.justify-content-between.flex-wrap');
      if (flex && isVisible(flex)) return flex;
    }

    return null;
  }

  function insertAboveElement(element) {
    if (!element || STATE.inserted) return false;

    // Falls schon vorhanden, nicht doppelt einfügen
    if (document.getElementById('ep-amd-toolbar')) {
      STATE.inserted = true;
      return true;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'ep-amd-toolbar';
    wrapper.style.cssText = [
      'display:flex',
      'justify-content:flex-end',
      'flex-wrap:wrap',
      'gap:8px',
      'margin:8px 0',
    ].join(';');

    const btn = createDownloadButton();
    wrapper.appendChild(btn);
    wrapper.appendChild(createIncludeReportToggle());

    element.parentElement.insertBefore(wrapper, element);
    STATE.inserted = true;
    return true;
  }

  function createDownloadButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Download all amendments';
    btn.title = 'Download all filtered PDF amendments on this page';
    btn.style.cssText = [
      'margin-left:0', // Abstand steuert der Wrapper/Controls
      'padding:6px 10px',
      'border-radius:6px',
      'border:1px solid rgb(210,140,35)',
      'background:rgb(242,170,60)',
      'color:#fff',
      'font:500 13px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      'cursor:pointer',
      'box-shadow:0 1px 2px rgba(0,0,0,0.08)',
      'display:inline-flex',
      'align-items:center',
      'gap:6px',
    ].join(';');

    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgb(220,150,40)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgb(242,170,60)';
    });

    btn.addEventListener('click', onDownloadAllClick);
    return btn;
  }

  function createIncludeReportToggle() {
    const label = document.createElement('label');
    label.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:6px',
      'font:500 12px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial',
      'color:#444',
      'margin-left:8px',
      'cursor:pointer',
    ].join(';');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!STATE.includeReports;
    cb.addEventListener('change', () => {
      STATE.includeReports = cb.checked;
      try { chrome.storage?.local?.set({ includeReports: STATE.includeReports }); } catch (_) {}
    });
    const text = document.createElement('span');
    text.textContent = 'Include report';
    label.append(cb, text);
    return label;
  }

  // Sammle nur Amendments-PDFs (Dropdown bevorzugt, sonst streng nach Pfad/Host filtern)
  function getAmendmentPdfLinks() {
    const root =
      document.querySelector('#esDropdownAMDContent') ||
      document.querySelector('.es_links-list') ||
      document.querySelector('.es_dropdown');

    let links = [];
    const toAbs = (href) => {
      try { return new URL(href, location.href).href; } catch { return ''; }
    };

    if (root) {
      links = Array.from(root.querySelectorAll('a[href$=".pdf"]')).map(a => toAbs(a.getAttribute('href')));
    } else {
      // Fallback: gesamte Seite, aber nur EP/Doceo-Dokumente mit -AM-
      links = Array.from(document.querySelectorAll('a[href$=".pdf"]')).map(a => toAbs(a.getAttribute('href')));
    }

    // Strikte Einschränkung: gleiche Domain, Doceo-Dokumentpfad und -AM- in der Datei
    links = links.filter((href) => {
      try {
        const u = new URL(href);
        return (
          u.hostname.endsWith('europarl.europa.eu') &&
          /\/doceo\/document\//.test(u.pathname) &&
          u.pathname.includes('-AM-')
        );
      } catch {
        return false;
      }
    });

    return Array.from(new Set(links));
  }

  function parseBaseDocIdFromUrl() {
    const m = location.pathname.match(/\/doceo\/(?:[a-z]{2}\/)?document\/([A-Z]+-\d+-\d{4}-\d{4})_[A-Z]{2}\.html/i);
    return m ? m[1] : null;
  }

  function getReportPdfLinks() {
    const base = parseBaseDocIdFromUrl();
    if (!base) return [];
    const lang = STATE.selectedLanguage || 'EN';

    const toAbs = (href) => { try { return new URL(href, location.href).href; } catch { return ''; } };
    const all = Array.from(document.querySelectorAll('a[href$=".pdf"]')).map(a => toAbs(a.getAttribute('href')));

    const filtered = all.filter((href) => {
      try {
        const u = new URL(href);
        const isEP = u.hostname.endsWith('europarl.europa.eu');
        const inDoceo = /\/doceo\/document\//.test(u.pathname);
        const isReport = u.pathname.includes(`${base}_${lang}.pdf`) && !u.pathname.includes('-AM-');
        return isEP && inDoceo && isReport;
      } catch {
        return false;
      }
    });

    return Array.from(new Set(filtered));
  }

  function filterPdfLinks(links) {
    const lang = STATE.selectedLanguage || 'EN';
    const skipFilter = !!STATE.filterCheckboxState; // when true, do not filter

    // Wenn der Filter deaktiviert ist, gar nicht einschränken – alle PDFs zurückgeben (wie im Popup)
    if (skipFilter) return links;

    // Genau 3 Ziffern vor _{LANG}.pdf und NICHT 4+
    const exactly3 = new RegExp(`-\\d{3}_${lang}\\.pdf$`);
    const moreThan3 = new RegExp(`-\\d{4,}_${lang}\\.pdf$`);

    return links.filter((l) => exactly3.test(l) && !moreThan3.test(l));
  }

  function downloadLinks(links) {
    // Trigger downloads by synthetic click, one by one
    links.forEach((url, idx) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `document_${idx + 1}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  async function onDownloadAllClick() {
    try {
      const amdAll = getAmendmentPdfLinks();
      const amdFiltered = filterPdfLinks(amdAll);
      let combined = amdFiltered;
      if (STATE.includeReports) {
        const reports = getReportPdfLinks();
        combined = Array.from(new Set([...amdFiltered, ...reports]));
      }

      if (!combined.length) {
        alert('Keine passenden PDF-Amendments gefunden.');
        return;
      }

      if (combined.length > 5) {
        const proceed = confirm(`Warnung: Es werden ${combined.length} PDFs heruntergeladen. Fortfahren?`);
        if (!proceed) return;
      }

      downloadLinks(combined);
    } catch (e) {
      console.error('Fehler beim Herunterladen der Amendments:', e);
      alert('Es ist ein Fehler aufgetreten. Details in der Konsole.');
    }
  }

  // Find a good anchor element near the Amendments dropdown or header
  function findAmendmentsAnchor() {
    // EP-spezifische Selektoren: Dropdown-Schaltfläche
    const explicitBtn =
      document.getElementById('esDropdownAMDButton') ||
      document.querySelector('.es_dropdown-btn#esDropdownAMDButton') ||
      document.querySelector('.es_dropdown .es_dropdown-btn');
    if (explicitBtn && isVisible(explicitBtn)) return explicitBtn;

    // Falls wir das Menü kennen, nimm die steuernde Schaltfläche (aria-controls)
    const menu = document.querySelector('#esDropdownAMDContent');
    if (menu) {
      const controller = document.querySelector(`[aria-controls="${menu.id}"]`);
      if (controller && isVisible(controller)) return controller;
    }

    // 1) Look for selects likely related to amendments (id/name/class contains 'amend')
    const selectCandidates = Array.from(document.querySelectorAll(
      'select[id*="amend" i], select[name*="amend" i], select[class*="amend" i]'
    )).filter(isVisible);
    if (selectCandidates.length) return selectCandidates[0];

    // 2) Look for containers likely related to amendments
    const container = Array.from(document.querySelectorAll(
      '[id*="amend" i], [class*="amend" i]'
    )).find(isVisible);
    if (container) {
      const innerSelect = container.querySelector('select');
      return innerSelect && isVisible(innerSelect) ? innerSelect : container;
    }

    // 3) Heuristic: look for labels/headings containing common translations
    const keywords = [
      'amend', // EN root
      'änderungs', // DE
      'amendement', // FR
      'enmiend', // ES
      'emend', // IT
      'poprawk', // PL
      'amendementen', // NL
      'alterações', // PT
      'ändrings', // SV
      'tarkist', // FI
      'pozměň', // CS
      'pozmeň', // SK
      'sprememb', // SL
      'módosít', // HU
      'amendament', // RO
      'изменен', // BG
      'τροπολογ', // EL
      'ændrings', // DA
      'muudatus', // ET
      'grozīj', // LV
      'pakeitim', // LT
      'amandman', // HR
      'emendi', // MT
      'leasú', // GA
    ];
    const textNodes = Array.from(document.querySelectorAll('label, h1, h2, h3, h4, h5, h6, span, div'))
      .filter(isVisible)
      .filter((el) => {
        const t = (el.textContent || '').toLowerCase();
        return t && keywords.some((k) => t.includes(k));
      });
    if (textNodes.length) {
      // Prefer a nearby select within the same block/parent
      const first = textNodes[0];
      const parent = first.closest('section, article, header, div, form') || first.parentElement;
      if (parent) {
        const nearSelect = parent.querySelector('select');
        if (nearSelect && isVisible(nearSelect)) return nearSelect;
      }
      return first;
    }

    return null;
  }

  function insertInlineButton(anchor) {
    if (STATE.inserted) return;
    const btn = createDownloadButton();
    const toggle = createIncludeReportToggle();

    // Controls-Gruppe
    const controls = document.createElement('span');
    controls.style.cssText = 'display:flex;align-items:center;gap:12px';
    controls.append(btn, toggle);

    // Wenn wir die Dropdown-Struktur kennen, packe Dropdown + Controls in einen gemeinsamen Flex-Wrapper
    const dropdownContainer = anchor.closest('.es_dropdown');
    if (dropdownContainer && dropdownContainer.parentElement) {
      const parent = dropdownContainer.parentElement;
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex;align-items:center;gap:12px;width:100%;flex-wrap:nowrap';
      parent.insertBefore(wrapper, dropdownContainer);
      wrapper.appendChild(dropdownContainer);

      // Beide Elemente gleich breit (50/50 der verfügbaren Breite minus Gap)
      dropdownContainer.style.flex = '1 1 0';
      dropdownContainer.style.maxWidth = '100%';
      dropdownContainer.style.minWidth = '0';
      const dropdownBtn = dropdownContainer.querySelector('.es_dropdown-btn') || dropdownContainer.querySelector('button');
      if (dropdownBtn) {
        dropdownBtn.style.width = '100%';
      }

      controls.style.flex = '1 1 0';
      controls.style.maxWidth = '100%';
      controls.style.minWidth = '0';
      controls.style.justifyContent = 'flex-end';

      wrapper.appendChild(controls);
      STATE.inserted = true;
      return true;
    }

    // Sonst wie bisher neben dem Button
    const targetBtn = anchor.closest ? (anchor.closest('button') || anchor) : anchor;
    if (targetBtn && targetBtn.tagName && targetBtn.tagName.toLowerCase() === 'button') {
      const parent = targetBtn.parentElement;
      if (parent) {
        parent.insertBefore(controls, targetBtn.nextSibling);
        STATE.inserted = true;
        return true;
      }
    }

    if (anchor && anchor.parentElement) {
      if (anchor.nextSibling) {
        anchor.parentElement.insertBefore(controls, anchor.nextSibling);
      } else {
        anchor.parentElement.appendChild(controls);
      }
      STATE.inserted = true;
      return true;
    }
    return false;
  }

  // Finde main > .container-fluid > .row und platziere die Toolbar ganz oben innerhalb der Row
  function findMainContainerRow() {
    const main = document.querySelector('main') || document.body;
    let container = main ? main.querySelector('div.container-fluid') : null;
    if (!container) container = document.querySelector('div.container-fluid');
    if (container) {
      const row = container.querySelector('div.row');
      if (row && isVisible(row)) return row;
    }
    return null;
  }

  function insertToolbarIntoRow(row) {
    if (!row || STATE.inserted) return false;

    if (document.getElementById('ep-amd-toolbar')) {
      STATE.inserted = true;
      return true;
    }

    const col = document.createElement('div');
    col.className = 'col-12';

    const wrapper = document.createElement('div');
    wrapper.id = 'ep-amd-toolbar';
    wrapper.style.cssText = [
      'display:flex',
      'justify-content:flex-end',
      'flex-wrap:wrap',
      'gap:8px',
      'margin:8px 0',
    ].join(';');

    const btn = createDownloadButton();
    wrapper.appendChild(btn);
    wrapper.appendChild(createIncludeReportToggle());
    col.appendChild(wrapper);

    row.insertBefore(col, row.firstElementChild || null);
    STATE.inserted = true;
    return true;
  }

  function tryInsert() {
    // Direkt neben dem Amendments-Dropdown einfügen (primär)
    const anchor = findAmendmentsAnchor();
    if (anchor && insertInlineButton(anchor)) return true;

    return false;
  }

  // Initial attempt after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        if (!tryInsert()) {
          // Keep observing for lazy content
          startObserver();
          // Fallback after a while
          setTimeout(() => {
            if (!STATE.inserted) insertFallbackFloatingButton();
          }, 4000);
        }
      }, 300);
    });
  } else {
    setTimeout(() => {
      if (!tryInsert()) {
        startObserver();
        setTimeout(() => {
          if (!STATE.inserted) insertFallbackFloatingButton();
        }, 4000);
      }
    }, 300);
  }

  // Last resort when the Amendments dropdown cannot be found: toolbar at the top of the main row,
  // otherwise a floating button (top frame only, to avoid duplicates in sub-frames).
  function insertFallbackFloatingButton() {
    if (STATE.inserted) return false;
    if (window.top !== window) return false;

    const row = findMainContainerRow();
    if (row && insertToolbarIntoRow(row)) return true;

    if (document.getElementById('ep-amd-toolbar')) {
      STATE.inserted = true;
      return true;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'ep-amd-toolbar';
    wrapper.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:8px',
      'border-radius:8px',
      'background:rgba(255,255,255,0.95)',
      'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
    ].join(';');
    wrapper.append(createDownloadButton(), createIncludeReportToggle());
    document.body.appendChild(wrapper);
    STATE.inserted = true;
    return true;
  }

  // tryInsert() scans the whole DOM, so run it debounced and stop watching after a while
  // instead of re-running it on every mutation of a page that never gets the button.
  function startObserver() {
    const DEBOUNCE_MS = 250;
    const MAX_WATCH_MS = 15000;
    let timer = null;

    const stop = () => {
      obs.disconnect();
      clearTimeout(timer);
    };

    const obs = new MutationObserver(() => {
      if (STATE.inserted) {
        stop();
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (STATE.inserted || tryInsert()) stop();
      }, DEBOUNCE_MS);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(stop, MAX_WATCH_MS);
  }
})();
