/**
 * Opinion Lens - Opinion.trade Content Script
 * Enhances the Opinion.trade platform with additional features
 */

import { MESSAGE_TYPES } from '../shared/constants.js';
import { formatPrice, formatPnL, formatNumber } from '../shared/utils.js';

// Configuration
const CONFIG = {
    widgetId: 'opinion-lens-widget',
    widgetClass: 'ol-widget',
};

/**
 * Position Tracker Widget
 */
class PositionTracker {
    constructor() {
        this.container = null;
        this.positions = [];
        this.isVisible = true;
    }

    async init() {
        this.createWidget();
        await this.loadPositions();
        this.startUpdates();
    }

    createWidget() {
        // Create floating widget
        this.container = document.createElement('div');
        this.container.id = CONFIG.widgetId;
        this.container.className = CONFIG.widgetClass;
        this.container.innerHTML = this.getWidgetHTML();
        document.body.appendChild(this.container);

        // Add styles
        const style = document.createElement('style');
        style.textContent = this.getWidgetStyles();
        document.head.appendChild(style);

        // Setup event listeners
        this.setupListeners();
    }

    getWidgetHTML() {
        return `
      <div class="ol-widget-header">
        <span class="ol-widget-title">📊 Position Tracker</span>
        <button class="ol-widget-toggle" title="Toggle">−</button>
      </div>
      <div class="ol-widget-body">
        <div class="ol-widget-summary">
          <div class="ol-stat">
            <span class="ol-stat-label">Total Value</span>
            <span class="ol-stat-value" id="ol-total-value">$0.00</span>
          </div>
          <div class="ol-stat">
            <span class="ol-stat-label">P&L</span>
            <span class="ol-stat-value ol-pnl" id="ol-total-pnl">$0.00</span>
          </div>
        </div>
        <div class="ol-positions" id="ol-positions">
          <div class="ol-empty">No positions</div>
        </div>
        <div class="ol-widget-actions">
          <button class="ol-action-btn" id="ol-export-btn">Export CSV</button>
          <button class="ol-action-btn" id="ol-refresh-btn">Refresh</button>
        </div>
      </div>
    `;
    }

    getWidgetStyles() {
        return `
      .ol-widget {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 280px;
        background: rgba(15, 15, 20, 0.95);
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 16px;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 999999;
        overflow: hidden;
        transition: all 0.3s ease;
      }
      .ol-widget.collapsed .ol-widget-body {
        display: none;
      }
      .ol-widget-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, transparent 100%);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        cursor: move;
      }
      .ol-widget-title {
        font-size: 13px;
        font-weight: 600;
        color: white;
      }
      .ol-widget-toggle {
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.1);
        color: white;
        font-size: 16px;
        cursor: pointer;
      }
      .ol-widget-toggle:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .ol-widget-body {
        padding: 12px;
      }
      .ol-widget-summary {
        display: flex;
        gap: 12px;
        margin-bottom: 12px;
      }
      .ol-stat {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
      }
      .ol-stat-label {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
      }
      .ol-stat-value {
        font-size: 16px;
        font-weight: 600;
        color: white;
        font-family: 'JetBrains Mono', monospace;
      }
      .ol-pnl.positive { color: #10B981; }
      .ol-pnl.negative { color: #EF4444; }
      .ol-positions {
        max-height: 200px;
        overflow-y: auto;
        margin-bottom: 12px;
      }
      .ol-position {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
        border-radius: 6px;
        margin-bottom: 6px;
        background: rgba(255, 255, 255, 0.03);
      }
      .ol-position:hover {
        background: rgba(255, 255, 255, 0.08);
      }
      .ol-position-title {
        font-size: 12px;
        color: white;
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ol-position-pnl {
        font-size: 12px;
        font-weight: 500;
        font-family: 'JetBrains Mono', monospace;
      }
      .ol-empty {
        padding: 20px;
        text-align: center;
        color: rgba(255, 255, 255, 0.4);
        font-size: 12px;
      }
      .ol-widget-actions {
        display: flex;
        gap: 8px;
      }
      .ol-action-btn {
        flex: 1;
        padding: 8px;
        border: none;
        border-radius: 6px;
        background: rgba(99, 102, 241, 0.2);
        color: #818CF8;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .ol-action-btn:hover {
        background: rgba(99, 102, 241, 0.3);
      }
    `;
    }

    setupListeners() {
        // Toggle collapse
        const toggle = this.container.querySelector('.ol-widget-toggle');
        toggle.addEventListener('click', () => {
            this.container.classList.toggle('collapsed');
            toggle.textContent = this.container.classList.contains('collapsed') ? '+' : '−';
        });

        // Export
        const exportBtn = this.container.querySelector('#ol-export-btn');
        exportBtn.addEventListener('click', () => this.exportCSV());

        // Refresh
        const refreshBtn = this.container.querySelector('#ol-refresh-btn');
        refreshBtn.addEventListener('click', () => this.loadPositions());

        // Make draggable
        this.makeDraggable();
    }

    makeDraggable() {
        const header = this.container.querySelector('.ol-widget-header');
        let isDragging = false;
        let offsetX, offsetY;

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - this.container.getBoundingClientRect().left;
            offsetY = e.clientY - this.container.getBoundingClientRect().top;
            this.container.style.transition = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            this.container.style.left = (e.clientX - offsetX) + 'px';
            this.container.style.top = (e.clientY - offsetY) + 'px';
            this.container.style.right = 'auto';
            this.container.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            this.container.style.transition = '';
        });
    }

    async loadPositions() {
        try {
            // In a real implementation, this would fetch from the API
            // For now, we'll try to extract from the page
            this.positions = this.extractPositionsFromPage();
            this.render();
        } catch (error) {
            console.error('[Opinion Lens] Failed to load positions:', error);
        }
    }

    extractPositionsFromPage() {
        // This would be customized based on Opinion.trade's actual DOM structure
        // Placeholder implementation
        return [];
    }

    render() {
        const positionsEl = this.container.querySelector('#ol-positions');
        const totalValueEl = this.container.querySelector('#ol-total-value');
        const totalPnlEl = this.container.querySelector('#ol-total-pnl');

        if (this.positions.length === 0) {
            positionsEl.innerHTML = '<div class="ol-empty">No positions</div>';
            totalValueEl.textContent = '$0.00';
            totalPnlEl.textContent = '$0.00';
            return;
        }

        const totalValue = this.positions.reduce((sum, p) => sum + p.value, 0);
        const totalPnl = this.positions.reduce((sum, p) => sum + p.pnl, 0);

        totalValueEl.textContent = `$${formatNumber(totalValue)}`;
        totalPnlEl.textContent = formatPnL(totalPnl);
        totalPnlEl.className = `ol-stat-value ol-pnl ${totalPnl >= 0 ? 'positive' : 'negative'}`;

        positionsEl.innerHTML = this.positions.map(p => `
      <div class="ol-position">
        <span class="ol-position-title">${p.title}</span>
        <span class="ol-position-pnl ${p.pnl >= 0 ? 'positive' : 'negative'}">
          ${formatPnL(p.pnl)}
        </span>
      </div>
    `).join('');
    }

    startUpdates() {
        // Refresh every 30 seconds
        setInterval(() => this.loadPositions(), 30000);
    }

    exportCSV() {
        if (this.positions.length === 0) {
            alert('No positions to export');
            return;
        }

        const headers = ['Market', 'Quantity', 'Avg Price', 'Current Price', 'Value', 'P&L', 'P&L %'];
        const rows = this.positions.map(p => [
            p.title,
            p.quantity,
            p.avgPrice,
            p.currentPrice,
            p.value,
            p.pnl,
            p.pnlPercent
        ]);

        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `opinion-positions-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();

        URL.revokeObjectURL(url);
    }
}

/**
 * Initialize
 */
async function init() {
    console.log('[Opinion Lens] Opinion.trade enhancements active');

    // Initialize position tracker
    const tracker = new PositionTracker();
    await tracker.init();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
