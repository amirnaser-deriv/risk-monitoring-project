// Dashboard state
let dashboardState = {
    positions: [],
    pnlHistory: [],
    volumeHistory: [],
    riskLevels: { low: 0, medium: 0, high: 0 },
    alerts: []
};

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

// Update metrics
function updateMetrics() {
    // Update total positions
    const totalPositions = dashboardState.positions.filter(p => p.status === 'open').length;
    document.getElementById('total-positions').textContent = totalPositions;

    // Calculate and update total exposure
    const totalExposure = dashboardState.positions
        .filter(p => p.status === 'open')
        .reduce((sum, pos) => sum + (pos.quantity * pos.current_price), 0);
    document.getElementById('total-exposure').textContent = formatCurrency(totalExposure);

    // Calculate and update daily P&L
    const dailyPnl = dashboardState.positions
        .filter(p => p.status === 'open')
        .reduce((sum, pos) => sum + (pos.pnl || 0), 0);
    const dailyPnlElement = document.getElementById('daily-pnl');
    dailyPnlElement.textContent = formatCurrency(dailyPnl);
    dailyPnlElement.className = `metric-value ${dailyPnl >= 0 ? 'positive' : 'negative'}`;

    // Update risk level
    const riskLevel = calculateRiskLevel(totalExposure, dailyPnl, totalPositions);
    const riskElement = document.getElementById('risk-level');
    riskElement.textContent = riskLevel.toUpperCase();
    riskElement.className = `metric-value ${riskLevel.toLowerCase()}`;
}

// Calculate risk level based on metrics
function calculateRiskLevel(exposure, pnl, positions) {
    // Example risk calculation logic
    if (positions === 0) return 'low';
    
    const exposureRisk = exposure > 1000000 ? 'high' : exposure > 500000 ? 'medium' : 'low';
    const pnlRisk = pnl < -50000 ? 'high' : pnl < -10000 ? 'medium' : 'low';
    const positionRisk = positions > 20 ? 'high' : positions > 10 ? 'medium' : 'low';

    // Combine risk factors
    const riskScores = {
        'high': 3,
        'medium': 2,
        'low': 1
    };

    const avgRiskScore = (riskScores[exposureRisk] + riskScores[pnlRisk] + riskScores[positionRisk]) / 3;
    
    if (avgRiskScore > 2.5) return 'high';
    if (avgRiskScore > 1.5) return 'medium';
    return 'low';
}

// Update positions table
function updatePositionsTable() {
    const tbody = document.getElementById('positions-table-body');
    tbody.innerHTML = '';

    dashboardState.positions
        .filter(pos => pos.status === 'open')
        .forEach(position => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${position.index_id}</td>
                <td>${position.side.toUpperCase()}</td>
                <td>${position.quantity}</td>
                <td>${formatCurrency(position.entry_price)}</td>
                <td>${formatCurrency(position.current_price)}</td>
                <td class="${position.pnl >= 0 ? 'positive' : 'negative'}">
                    ${formatCurrency(position.pnl)}
                </td>
                <td>
                    <span class="status-indicator ${position.status}">
                        ${position.status.toUpperCase()}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });
}

// Update alerts
function updateAlerts() {
    const alertsList = document.getElementById('alerts-list');
    alertsList.innerHTML = '';

    dashboardState.alerts.forEach(alert => {
        const alertElement = document.createElement('div');
        alertElement.className = `alert-item ${alert.level}`;
        alertElement.innerHTML = `
            <div class="alert-header">
                <strong>${alert.title}</strong>
                <span>${new Date(alert.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="alert-message">${alert.message}</div>
        `;
        alertsList.appendChild(alertElement);
    });
}

// Check for new alerts
function checkAlerts() {
    const alerts = [];
    const openPositions = dashboardState.positions.filter(p => p.status === 'open');
    
    // Check total exposure
    const totalExposure = openPositions.reduce((sum, pos) => sum + (pos.quantity * pos.current_price), 0);
    if (totalExposure > 1000000) {
        alerts.push({
            level: 'high',
            title: 'High Exposure Alert',
            message: `Total exposure exceeds $1M: ${formatCurrency(totalExposure)}`,
            timestamp: new Date()
        });
    }

    // Check large losses
    const totalPnl = openPositions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
    if (totalPnl < -50000) {
        alerts.push({
            level: 'high',
            title: 'Significant Loss Alert',
            message: `Current P&L below -$50K: ${formatCurrency(totalPnl)}`,
            timestamp: new Date()
        });
    }

    // Check position concentration
    if (openPositions.length > 20) {
        alerts.push({
            level: 'medium',
            title: 'Position Concentration Alert',
            message: `High number of open positions: ${openPositions.length}`,
            timestamp: new Date()
        });
    }

    // Update dashboard state with new alerts
    dashboardState.alerts = alerts;
    updateAlerts();
}

// Fetch and update dashboard data
async function updateDashboard() {
    try {
        // Fetch open positions
        const { data: positions, error: posError } = await window.supabaseClient.client
            .from('positions')
            .select('*');
        
        if (posError) throw posError;

        // Update dashboard state
        dashboardState.positions = positions;

        // Calculate historical data (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Simulate P&L history (replace with actual data)
        dashboardState.pnlHistory = Array.from({ length: 7 }, (_, i) => ({
            date: new Date(sevenDaysAgo.getTime() + (i * 86400000)).toLocaleDateString(),
            value: positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0)
        }));

        // Update UI
        updateMetrics();
        updatePositionsTable();
        checkAlerts();

        // Update charts
        if (window.dashboardCharts) {
            window.dashboardCharts.updateCharts(dashboardState);
        }

    } catch (error) {
        console.error('Error updating dashboard:', error);
        if (window.auth?.showError) {
            window.auth.showError('Failed to update dashboard');
        }
    }
}

// Initialize dashboard
async function initializeDashboard() {
    try {
        // Initial data fetch
        await updateDashboard();

        // Set up real-time updates
        setInterval(updateDashboard, 5000); // Update every 5 seconds

    } catch (error) {
        console.error('Error initializing dashboard:', error);
        if (window.auth?.showError) {
            window.auth.showError('Failed to initialize dashboard');
        }
    }
}

// Initialize when both Supabase and Auth are ready
let isSupabaseReady = false;
let isAuthReady = false;

window.addEventListener('supabaseReady', () => {
    isSupabaseReady = true;
    if (isAuthReady) initializeDashboard();
});

window.addEventListener('authReady', () => {
    isAuthReady = true;
    if (isSupabaseReady) initializeDashboard();
});
