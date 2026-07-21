import { HtmlScene } from '../../../q-legacy/js/omni-support/html-scene.js';


class TreeBrowser extends HtmlScene {
  constructor(container) {
    super(container);
    this.container = container;
    this.LINE_HEIGHT = 20;
    this.BUFFER_LINES = 20;

    this.rawLines = [];
    this.parsedCache = {};
    this.lineCount = 0;
    this.selectedIndex = -1;
    this.searchMatches = new Set();
    this.searchMatchList = [];
    this.currentMatchIndex = -1;

    this.visibleStart = 0;
    this.visibleEnd = 0;
    this.lineElements = {};

    this.forwardHistory = [];

    this.renderVisibleLines = this.renderVisibleLines.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this._initDOM();
  }

  _initDOM() {
    this.container.innerHTML = `
      <div id="treeBrowserUI" style="display: flex; flex-direction: column; height: 100%; width: 100%;">
        <div class="toolbar">
          <label>Search:</label>
          <input type="text" class="tb-search-box" placeholder="Type to search...">
          <button class="tb-prev-btn">◀ Prev</button>
          <button class="tb-next-btn">Next ▶</button>
          <span class="search-info tb-search-info"></span>
          <span class="line-info tb-line-info"></span>
          <button class="tb-reset-btn">Reset</button>
        </div>
        <div class="breadcrumbs tb-breadcrumbs">
          <span class="label">Path:</span>
        </div>
        <div class="tree-container tb-tree-container" display:flex; style="flex: 1 1 0; min-height: 0; position: relative;">
          <div class="tree-scroll-content tb-tree-scroll-content" style="position: relative; width: max-content; min-width: 100%;">
          </div>
        </div>
      </div>
    `;

    this.searchBox = this.container.querySelector('.tb-search-box');
    this.prevBtn = this.container.querySelector('.tb-prev-btn');
    this.nextBtn = this.container.querySelector('.tb-next-btn');
    this.searchInfo = this.container.querySelector('.tb-search-info');
    this.lineInfo = this.container.querySelector('.tb-line-info');
    this.resetBtn = this.container.querySelector('.tb-reset-btn');
    this.breadcrumbsContainer = this.container.querySelector('.tb-breadcrumbs');
    this.treeContainer = this.container.querySelector('.tb-tree-container');
    this.treeScrollContent = this.container.querySelector('.tb-tree-scroll-content');

    this.treeContainer.addEventListener('scroll', () => {
      requestAnimationFrame(this.renderVisibleLines);
    });

    let searchTimeout;
    this.searchBox.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => this.performSearch(), 300);
    });

    this.prevBtn.addEventListener('click', () => this.findPrev());
    this.nextBtn.addEventListener('click', () => this.findNext());
    this.resetBtn.addEventListener('click', () => this.resetView());

    document.addEventListener('keydown', this.handleKeyDown);
  }

  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.container.innerHTML = '';
  }

  handleKeyDown(e) {
    // Only handle if this container is active/visible
    if (this.container.style.opacity === "0" || this.container.style.display === "none" || !this.container.offsetParent) return;

    const isSearchFocused = document.activeElement === this.searchBox;

    if (e.key === 'Escape') {
      this.searchBox.value = '';
      this.searchMatches.clear();
      this.searchMatchList = [];
      this.currentMatchIndex = -1;
      this.searchInfo.textContent = '';
      for (const idx in this.lineElements) {
        this.lineElements[idx].classList.remove('search-match');
      }
      this.searchBox.blur();
      return;
    }

    if (e.key === 'Enter' && isSearchFocused) {
      if (this.searchMatchList.length === 0) {
        this.performSearch();
      } else {
        this.findNext();
      }
      return;
    }

    if (isSearchFocused) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.selectedIndex < this.lineCount - 1) {
        this.selectLine(this.selectedIndex + 1);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.selectedIndex > 0) {
        this.selectLine(this.selectedIndex - 1);
      }
    } else if (e.key === '/') {
      e.preventDefault();
      this.searchBox.focus();
    }
  }

  loadTreeFromText(text) {
    if (!text) {
        text = '';
    }
    const lines = text.split('\n');
    this.lineCount = lines.length;
    this.rawLines = [];
    let currentPipes = "";

    for (let i = 0; i < this.lineCount; i++) {
      const raw = lines[i];
      // If it has a \d+: prefix (like Proteins), handle dead reckoning.
      // If not, it's a standard tree line.
      const depthMatch = raw.match(/^(\d+):/);
      if (!depthMatch) {
        // Prepend 0: so it matches the expected internal format,
        // allowing parseLine to properly extract treeChars and depth based on length of treeChars.
        this.rawLines.push(`0:${raw}`);
        continue;
      }

      const prefixNum = parseInt(depthMatch[1], 10);
      const rest = raw.substring(depthMatch[0].length);
      const treeCharsMatch = rest.match(/^([│├└─\s]*)/);
      const treeChars = treeCharsMatch ? treeCharsMatch[1] : '';
      const content = rest.substring(treeChars.length);

      let expanded = currentPipes.substring(0, prefixNum);
      if (expanded.length < prefixNum) {
        expanded = expanded.padEnd(prefixNum, " ");
      }

      let nextStateBase = expanded + treeChars;
      let nextState = "";
      for (let j = 0; j < nextStateBase.length; j += 3) {
        const chunk = nextStateBase.substring(j, j + 3);
        if (chunk.includes('│') || chunk.includes('├')) {
          nextState += "│  ";
        } else {
          nextState += "   ";
        }
      }
      currentPipes = nextState;

      this.rawLines.push(`0:${expanded}${treeChars}${content}`);
    }

    this.initializeTreeView();
  }

  initializeTreeView() {
    this.treeScrollContent.style.height = (this.lineCount * this.LINE_HEIGHT) + 'px';
    this.treeScrollContent.innerHTML = '';
    this.lineElements = {};
    this.forwardHistory = [];
    this.parsedCache = {};

    this.renderVisibleLines();
    if (this.lineCount > 0) {
      this.selectLine(0);
    }
  }

  parseLine(index) {
    if (this.parsedCache[index]) return this.parsedCache[index];

    const raw = this.rawLines[index];
    if (!raw) return null;

    const depthMatch = raw.match(/^(\d+):/);
    if (!depthMatch) {
      this.parsedCache[index] = { raw, depth: 0, content: raw };
      return this.parsedCache[index];
    }

    const depthPrefix = parseInt(depthMatch[1], 10);
    const rest = raw.substring(depthMatch[0].length);

    const treeCharsMatch = rest.match(/^([│├└─\s]*)/);
    const treeChars = treeCharsMatch ? treeCharsMatch[1] : '';
    const afterTree = rest.substring(treeChars.length);

    const depth = Math.floor(treeChars.length / 3);

    const nodeMatch = afterTree.match(/^\s*([A-Z0-9_]+)\s+Length:(\d+)(?:\s+\(s:(\d+)\))?\s*(?:\[([^\]]+)\])?\s*(.*)$/);

    if (!nodeMatch) {
      this.parsedCache[index] = {
        raw, depthPrefix, treeChars, depth,
        content: afterTree.trim(),
        accession: null
      };
      return this.parsedCache[index];
    }

    const [, accession, length, score, rootInfo, remainder] = nodeMatch;

    let name = '', organism = '';
    const semicolonIdx = remainder.indexOf(';');
    if (semicolonIdx >= 0) {
      name = remainder.substring(0, semicolonIdx).trim();
      organism = remainder.substring(semicolonIdx + 1).replace(/\.$/, '').trim();
    } else {
      name = remainder.replace(/\.$/, '').trim();
    }

    this.parsedCache[index] = {
      raw, depthPrefix, treeChars, depth,
      accession,
      length: parseInt(length, 10),
      score: score ? parseInt(score, 10) : null,
      rootInfo, name, organism
    };

    return this.parsedCache[index];
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  renderLineHtml(index) {
    const line = this.parseLine(index);
    if (!line) return '';

    const fullTreeChars = line.treeChars || '';

    let html = `<span class="tree-chars">${this.escapeHtml(fullTreeChars)}</span>`;

    if (line.accession) {
      html += `<span class="node-accession">${this.escapeHtml(line.accession)}</span>`;
      html += ` <span class="node-length">Length:${line.length}</span>`;
      if (line.score !== null) {
        html += ` <span class="node-score">(s:${line.score})</span>`;
      }
      if (line.rootInfo) {
        html += ` [${this.escapeHtml(line.rootInfo)}]`;
      }
      if (line.name) {
        html += ` <span class="node-name">${this.escapeHtml(line.name)}</span>`;
      }
      if (line.organism) {
        html += `; <span class="node-organism">${this.escapeHtml(line.organism)}</span>`;
      }
    } else {
      html += `<span class="node-name">${this.escapeHtml(line.content || '')}</span>`;
    }

    return html;
  }

  createLineElement(index) {
    const div = document.createElement('div');
    div.className = 'tree-line';
    div.style.top = (index * this.LINE_HEIGHT) + 'px';
    div.style.height = this.LINE_HEIGHT + 'px';
    div.innerHTML = this.renderLineHtml(index);
    div.dataset.index = index;

    if (index === this.selectedIndex) {
      div.classList.add('selected');
    }
    if (this.searchMatches.has(index)) {
      div.classList.add('search-match');
    }

    div.addEventListener('click', () => this.selectLine(index));

    return div;
  }

  renderVisibleLines() {
    const scrollTop = this.treeContainer.scrollTop;
    const viewportHeight = this.treeContainer.clientHeight;

    const newStart = Math.max(0, Math.floor(scrollTop / this.LINE_HEIGHT) - this.BUFFER_LINES);
    const newEnd = Math.min(this.lineCount, Math.ceil((scrollTop + viewportHeight) / this.LINE_HEIGHT) + this.BUFFER_LINES);

    for (const idx in this.lineElements) {
      const i = parseInt(idx);
      if (i < newStart || i >= newEnd) {
        this.lineElements[i].remove();
        delete this.lineElements[i];
      }
    }

    for (let i = newStart; i < newEnd; i++) {
      if (!this.lineElements[i]) {
        const el = this.createLineElement(i);
        this.treeScrollContent.appendChild(el);
        this.lineElements[i] = el;
      }
    }

    this.visibleStart = newStart;
    this.visibleEnd = newEnd;
  }

  findAncestors(index) {
    const ancestors = [];
    if (index < 0 || index >= this.lineCount) return ancestors;

    const targetLine = this.parseLine(index);
    if (!targetLine) return ancestors;

    let currentDepth = targetLine.depth;

    for (let i = index - 1; i >= 0; i--) {
      const line = this.parseLine(i);
      if (line && line.depth < currentDepth) {
        ancestors.unshift({ index: i, line });
        currentDepth = line.depth;
        if (currentDepth === 0) break;
      }
    }

    return ancestors;
  }

  updateBreadcrumbs(index, fromBreadcrumbClick = false, clickedBreadcrumbIdx = -1) {
    this.breadcrumbsContainer.innerHTML = '<span class="label">Path:</span>';

    if (index < 0 || index >= this.lineCount) return;

    const ancestors = this.findAncestors(index);
    const currentLine = this.parseLine(index);

    if (fromBreadcrumbClick && clickedBreadcrumbIdx >= 0) {
      const oldAncestors = this.findAncestors(this.selectedIndex);
      const oldTrail = [...oldAncestors.map(a => ({ index: a.index, accession: a.line.accession }))];
      oldTrail.push({ index: this.selectedIndex, accession: this.parseLine(this.selectedIndex)?.accession });

      oldTrail.push(...this.forwardHistory);
      this.forwardHistory = oldTrail.slice(clickedBreadcrumbIdx + 1);
    }

    const getNodeId = (line) => {
      if (!line || !line.accession) return '?';
      return line.accession;
    };

    ancestors.forEach((anc, i) => {
      const span = document.createElement('span');
      span.className = 'breadcrumb';
      span.textContent = anc.line.accession || `Node@${anc.index}`;
      span.addEventListener('click', () => {
        this.navigateViaBreadcrumb(anc.index, i);
      });
      this.breadcrumbsContainer.appendChild(span);

      const nextLine = (i < ancestors.length - 1) ? ancestors[i + 1].line : currentLine;
      const parentNodeNum = getNodeId(anc.line);
      const childNodeNum = getNodeId(nextLine);
      const childScore = nextLine?.score;

      const sep = document.createElement('span');
      sep.className = 'separator';
      sep.innerHTML = '›';

      const tooltip = document.createElement('span');
      tooltip.className = 'tooltip';
      let tooltipText = `${parentNodeNum}-${childNodeNum}`;
      if (childScore !== null && childScore !== undefined) {
        tooltipText = `score:${childScore}\\n${tooltipText}`;
      }
      tooltip.textContent = tooltipText;
      sep.appendChild(tooltip);

      sep.dataset.parentNode = parentNodeNum;
      sep.dataset.childNode = childNodeNum;
      sep.dataset.score = childScore || '';

      this.breadcrumbsContainer.appendChild(sep);
    });

    const current = document.createElement('span');
    current.className = 'breadcrumb current';
    current.textContent = (currentLine && currentLine.accession) || `Node@${index}`;
    this.breadcrumbsContainer.appendChild(current);

    let prevLine = currentLine;
    this.forwardHistory.forEach((fwd, i) => {
      const fwdLine = this.parseLine(fwd.index);
      const parentNodeNum = getNodeId(prevLine);
      const childNodeNum = getNodeId(fwdLine);
      const childScore = fwdLine?.score;

      const sep = document.createElement('span');
      sep.className = 'separator ghosted';
      sep.innerHTML = '›';

      const tooltip = document.createElement('span');
      tooltip.className = 'tooltip';
      let tooltipText = `${parentNodeNum}-${childNodeNum}`;
      if (childScore !== null && childScore !== undefined) {
        tooltipText = `score:${childScore}\\n${tooltipText}`;
      }
      tooltip.textContent = tooltipText;
      sep.appendChild(tooltip);

      sep.dataset.parentNode = parentNodeNum;
      sep.dataset.childNode = childNodeNum;
      sep.dataset.score = childScore || '';

      this.breadcrumbsContainer.appendChild(sep);

      const span = document.createElement('span');
      span.className = 'breadcrumb ghosted';
      span.textContent = fwd.accession || `Node@${fwd.index}`;
      span.addEventListener('click', () => {
        this.navigateForward(i);
      });
      this.breadcrumbsContainer.appendChild(span);

      prevLine = fwdLine;
    });
  }

  navigateViaBreadcrumb(index, breadcrumbIdx) {
    this.updateBreadcrumbs(index, true, breadcrumbIdx);
    if (this.selectedIndex >= 0 && this.lineElements[this.selectedIndex]) {
      this.lineElements[this.selectedIndex].classList.remove('selected');
    }
    this.selectedIndex = index;
    if (this.lineElements[index]) {
      this.lineElements[index].classList.add('selected');
    }
    this.updateLineInfo();
    this.scrollToLine(index);
  }

  navigateForward(forwardIdx) {
    const target = this.forwardHistory[forwardIdx];
    if (!target) return;
    this.forwardHistory = this.forwardHistory.slice(forwardIdx + 1);

    if (this.selectedIndex >= 0 && this.lineElements[this.selectedIndex]) {
      this.lineElements[this.selectedIndex].classList.remove('selected');
    }
    this.selectedIndex = target.index;
    if (this.lineElements[target.index]) {
      this.lineElements[target.index].classList.add('selected');
    }
    this.updateBreadcrumbs(target.index);
    this.updateLineInfo();
    this.scrollToLine(target.index);
  }

  selectLine(index) {
    this.forwardHistory = [];
    if (this.selectedIndex >= 0 && this.lineElements[this.selectedIndex]) {
      this.lineElements[this.selectedIndex].classList.remove('selected');
    }
    this.selectedIndex = index;
    if (this.lineElements[index]) {
      this.lineElements[index].classList.add('selected');
    }
    this.updateBreadcrumbs(index);
    this.updateLineInfo();
    this.scrollToLine(index);
  }

  scrollToLine(index) {
    const targetScrollTop = (index * this.LINE_HEIGHT) - (this.treeContainer.clientHeight / 2) + (this.LINE_HEIGHT / 2);
    this.treeContainer.scrollTop = Math.max(0, targetScrollTop);

    const line = this.parseLine(index);
    if (line) {
      const fullTreeChars = line.treeChars || '';
      const charWidth = 7.8;
      const contentStart = fullTreeChars.length * charWidth;
      const targetScrollLeft = Math.max(0, contentStart - 50);
      this.treeContainer.scrollLeft = targetScrollLeft;
    }

    this.renderVisibleLines();
    if (this.lineElements[index]) {
      this.lineElements[index].classList.add('selected');
    }
  }

  updateLineInfo() {
    this.lineInfo.textContent = `Line ${(this.selectedIndex + 1).toLocaleString()} of ${this.lineCount.toLocaleString()}`;
  }

  performSearch() {
    const query = this.searchBox.value.toLowerCase().trim();

    this.searchMatches.clear();
    this.searchMatchList = [];
    this.currentMatchIndex = -1;

    for (const idx in this.lineElements) {
      this.lineElements[idx].classList.remove('search-match');
    }

    if (!query) {
      this.searchInfo.textContent = '';
      return;
    }

    let batchSize = 50000;
    let i = 0;

    const searchBatch = () => {
      const end = Math.min(i + batchSize, this.lineCount);
      for (; i < end; i++) {
        const raw = this.rawLines[i];
        if (raw && raw.toLowerCase().includes(query)) {
          this.searchMatches.add(i);
          this.searchMatchList.push(i);
        }
      }

      if (i < this.lineCount) {
        setTimeout(searchBatch, 0);
      } else {
        this.finishSearch();
      }
    };

    searchBatch();
  }

  finishSearch() {
    this.searchInfo.textContent = `${this.searchMatchList.length.toLocaleString()} matches`;
    for (const idx in this.lineElements) {
      if (this.searchMatches.has(parseInt(idx))) {
        this.lineElements[idx].classList.add('search-match');
      }
    }
    if (this.searchMatchList.length > 0) {
      this.currentMatchIndex = 0;
      this.selectLine(this.searchMatchList[0]);
      this.updateSearchInfo();
    }
  }

  findNext() {
    if (this.searchMatchList.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMatchList.length;
    this.selectLine(this.searchMatchList[this.currentMatchIndex]);
    this.updateSearchInfo();
  }

  findPrev() {
    if (this.searchMatchList.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex - 1 + this.searchMatchList.length) % this.searchMatchList.length;
    this.selectLine(this.searchMatchList[this.currentMatchIndex]);
    this.updateSearchInfo();
  }

  updateSearchInfo() {
    if (this.searchMatchList.length > 0) {
      this.searchInfo.textContent = `${(this.currentMatchIndex + 1).toLocaleString()} of ${this.searchMatchList.length.toLocaleString()}`;
    }
  }

  resetView() {
    this.searchBox.value = '';
    this.searchMatches.clear();
    this.searchMatchList = [];
    this.currentMatchIndex = -1;
    this.forwardHistory = [];
    this.searchInfo.textContent = '';

    for (const idx in this.lineElements) {
      this.lineElements[idx].classList.remove('search-match');
    }

    this.selectLine(0);
  }
}

export {TreeBrowser}
