// UI Elements
const loadingOverlay = document.getElementById('loading-overlay');
const totalExposure = document.getElementById('total-exposure');
const exposureChange = document.getElementById('exposure-change');
const netPnl = document.getElementById('net-pnl');
const pnlChange = document.getElementById('pnl-change');
const activePositions = document.getElementById('active-positions');
const positionsChange = document.getElementById('positions-change');
const riskScore = document.getElementById('risk-score');
const riskStatus = document.getElementById('risk-status');
const alertsList = document.getElementById('alerts-list');
const positionsList = document.getElementById('positions-list');

// Format helpers
function formatCurrency(number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(number);
}

function formatPercentage(number) {
    return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        signDisplay: 'always'
    }).format(number / 100);
}

// Show/hide loading overlay
function toggleLoading(show) {
    loadingOverlay.style.display = show ? 'block' : 'none';
}

// Create alert card
function createAlertCard(alert) {
    const card = document.createElement('div');
    card.className = 'alert-card';
    
    const timeAgo = new Date(alert.created_at).toLocaleString();
    
    card.innerHTML = `
        <div class="alert-header">
            <span class="alert-title">${alert.title}</span>
            <span class="alert-time">${timeAgo}</span>
        </div>
        <div class="alert-message">${alert.message}</div>
        <div class="alert-actions">
            <button onclick="acknowledgeAlert('${alert.id}')" 
                    style="background: var(--primary); color: white;">
                Acknowledge
            </button>
            <button onclick="dismissAlert('${alert.id}')"
                    style="background: var(--danger); color: white;">
                Dismiss
            </button>
        </div>
    `;
    return card;
}

// Create position row
function createPositionRow(position) {
    const tr = document.createElement('tr');
    const pnl = position.unrealized_pnl;
    const pnlClass = pnl >= 0 ? 'positive' : 'negative';
    
    tr.innerHTML = `
        <td>${position.index_id}</td>
        <td>${position.quantity}</td>
        <td>${formatCurrency(position.avg_entry_price)}</td>
        <td>${formatCurrency(position.current_price)}</td>
        <td class="${pnlClass}">${formatCurrency(pnl)}</td>
        <td>
            <span class="position-status status-${position.status.toLowerCase()}">
                ${position.status}
            </span>
        </td>
    `;
    return tr;
}

// Update dashboard metrics
async function updateMetrics() {
    try {
        const { data: positions, error: positionsError } = await supabaseClient.client
            .from('positions')
            .select('*')
            .eq('status', 'active');

        if (positionsError) throw positionsError;

        // Calculate metrics
        const exposure = positions.reduce((sum, pos) => sum + (pos.quantity * pos.current_price), 0);
        const pnl = positions.reduce((sum, pos) => sum + pos.unrealized_pnl, 0);
        const count = positions.length;

        // Update UI
        totalExposure.textContent = formatCurrency(exposure);
        netPnl.textContent = formatCurrency(pnl);
        activePositions.textContent = count;

        // Update risk score (simple calculation for demo)
        const score = Math.min(100, Math.round((exposure / 1000000) * 100));
        riskScore.textContent = score;
        
        // Update risk status
        if (score < 30) {
            riskStatus.textContent = 'Low Risk';
            riskStatus.className = 'metric-change positive';
        } else if (score < 70) {
            riskStatus.textContent = 'Moderate Risk';
            riskStatus.className = 'metric-change';
        } else {
            riskStatus.textContent = 'High Risk';
            riskStatus.className = 'metric-change negative';
        }

        // Update charts
        const exposureData = positions.reduce((acc, pos) => {
            const value = pos.quantity * pos.current_price;
            const existing = acc.find(item => item.label === pos.index_id);
            if (existing) {
                existing.value += value;
            } else {
                acc.push({ label: pos.index_id, value });
            }
            return acc;
        }, []);

        window.charts.updateExposureChart(exposureData);

        // Update P/L trend data
        const today = new Date();
        const pnlData = Array.from({ length: 30 }, (_, i) => {
            const date = new Date(today);
            date.setDate(date.getDate() - (29 - i));
            return {
                date: date.toLocaleDateString(),
                value: Math.random() * 10000 - 5000 // Mock data for demo
            };
        });
        window.charts.updatePnlChart(pnlData);

    } catch (error) {
        console.error('Error updating metrics:', error);
        showError('Failed to update dashboard metrics');
    }
}

// Load positions table
async function loadPositions() {
    try {
        const { data: positions, error } = await supabaseClient.client
            .from('positions')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) throw error;

        positionsList.innerHTML = '';
        positions.forEach(position => {
            const row = createPositionRow(position);
            positionsList.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading positions:', error);
        showError('Failed to load positions');
    }
}

// Load alerts
async function loadAlerts() {
    try {
        const { data: alerts, error } = await supabaseClient.client
            .from('alerts')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) throw error;

        alertsList.innerHTML = '';
        if (alerts && alerts.length > 0) {
            alerts.forEach(alert => {
                const card = createAlertCard(alert);
                alertsList.appendChild(card);
            });
        } else {
            alertsList.innerHTML = `
                <div style="text-align: center; color: var(--text-light); padding: 1rem;">
                    No active alerts
                </div>
            `;
        }

    } catch (error) {
        console.error('Error loading alerts:', error);
        showError('Failed to load alerts');
    }
}

// Handle alert actions
async function acknowledgeAlert(alertId) {
    try {
        const { error } = await supabaseClient.client
            .from('alerts')
            .update({ status: 'acknowledged' })
            .eq('id', alertId);

        if (error) throw error;
        await loadAlerts();
        showSuccess('Alert acknowledged');
    } catch (error) {
        console.error('Error acknowledging alert:', error);
        showError('Failed to acknowledge alert');
    }
}

async function dismissAlert(alertId) {
    try {
        const { error } = await supabaseClient.client
            .from('alerts')
            .update({ status: 'dismissed' })
            .eq('id', alertId);

        if (error) throw error;
        await loadAlerts();
        showSuccess('Alert dismissed');
    } catch (error) {
        console.error('Error dismissing alert:', error);
        showError('Failed to dismiss alert');
    }
}

// Subscribe to real-time updates
function subscribeToUpdates() {
    // Subscribe to position updates
    supabaseClient.subscribeToChannel('positions-channel', 'positions', (payload) => {
        updateMetrics();
        loadPositions();
    });

    // Subscribe to alert updates
    supabaseClient.subscribeToChannel('alerts-channel', 'alerts', (payload) => {
        loadAlerts();
    });
}

// Initialize dashboard
window.addEventListener('supabaseReady', async () => {
    if (supabaseClient.ready) {
        toggleLoading(true);
        try {
            await updateMetrics();
            await loadPositions();
            await loadAlerts();
            subscribeToUpdates();
        } catch (error) {
            console.error('Error initializing dashboard:', error);
            showError('Failed to initialize dashboard');
        } finally {
            toggleLoading(false);
        }
    }
});

// Handle auth state changes
window.addEventListener('authStateChange', async ({ detail }) => {
    if (detail.user) {
        if (detail.role === 'risk_manager' || detail.role === 'admin') {
            await updateMetrics();
            await loadPositions();
            await loadAlerts();
        } else {
            showError('Access denied. Risk manager role required.');
            setTimeout(() => {
                window.location.href = '../trading-site/index.html';
            }, 2000);
        }
    } else {
        // Clear dashboard data
        totalExposure.textContent = '$0.00';
        netPnl.textContent = '$0.00';
        activePositions.textContent = '0';
        riskScore.textContent = '0';
        positionsList.innerHTML = '';
        alertsList.innerHTML = '';
    }
});

// Auto-refresh metrics every minute
setInterval(updateMetrics, 60000);
