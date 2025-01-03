console.log('Loading trading site module...');

// UI Elements
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const indicesList = document.getElementById('indices-list');
const indexSelect = document.getElementById('index-select');
const positionsList = document.getElementById('positions-list');
const ordersList = document.getElementById('orders-list');
const tradeForm = document.getElementById('trade-form');

// Mock data for development (Prices will change every second)
let mockIndices = [
    { id: 'TACTICAL_INDEX_1', name: 'Tactical Index 1', price: 1250.75, change: 2.5 },
    { id: 'TACTICAL_INDEX_2', name: 'Tactical Index 2', price: 980.25, change: -1.8 },
    { id: 'TACTICAL_INDEX_3', name: 'Tactical Index 3', price: 1100.50, change: 0.5 }
];

// Random price update interval (in ms)
const PRICE_UPDATE_INTERVAL = 1000; // 1 second

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

// Calculate PnL for a position
function calculatePnL(position, currentPrice) {
    const quantity = position.quantity;
    const entryPrice = position.entry_price;
    if (position.side === 'buy') {
        return quantity * (currentPrice - entryPrice);
    } else {
        return quantity * (entryPrice - currentPrice);
    }
}

// Initialize select options (only once)
function initializeSelectOptions() {
    indexSelect.innerHTML = '<option value="">Choose an index...</option>';
    mockIndices.forEach(index => {
        const option = document.createElement('option');
        option.value = index.id;
        option.textContent = index.name;
        indexSelect.appendChild(option);
    });
}

// Update only the price displays
function updatePriceDisplays() {
    const cards = indicesList.querySelectorAll('.index-card');
    cards.forEach((card, index) => {
        const priceElement = card.querySelector('.index-price');
        const changeElement = card.querySelector('.price-change');
        const currentIndex = mockIndices[index];
        
        if (priceElement && changeElement) {
            priceElement.textContent = formatCurrency(currentIndex.price);
            changeElement.textContent = formatPercentage(currentIndex.change);
            changeElement.className = `price-change ${currentIndex.change >= 0 ? 'positive' : 'negative'}`;
        }
    });

    // Update current prices and PnL for open positions
    updateOpenPositions();
}

// Update open positions with current prices
async function updateOpenPositions() {
    try {
        const { data: positions, error } = await window.supabaseClient.client
            .from('positions')
            .select('*')
            .eq('status', 'open');

        if (error) throw error;

        // Update each position's current price and PnL
        for (const position of positions) {
            const currentIndex = mockIndices.find(idx => idx.id === position.index_id);
            if (currentIndex) {
                const currentPrice = currentIndex.price;
                const pnl = calculatePnL(position, currentPrice);

                const { error: updateError } = await window.supabaseClient.client
                    .from('positions')
                    .update({
                        current_price: currentPrice,
                        pnl: pnl,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', position.id);

                if (updateError) console.error('Error updating position:', updateError);
            }
        }

        // Refresh positions display
        await loadPositions();
    } catch (error) {
        console.error('Error updating open positions:', error);
    }
}

// Simulate price fluctuation
function randomizePrices() {
    mockIndices = mockIndices.map(index => {
        const changeFactor = (Math.random() * 2 - 1) * 0.01;
        const oldPrice = index.price;
        const newPrice = oldPrice * (1 + changeFactor);
        const percentChange = ((newPrice - oldPrice) / oldPrice) * 100;

        return {
            ...index,
            price: parseFloat(newPrice.toFixed(2)),
            change: parseFloat(percentChange.toFixed(2))
        };
    });
    updatePriceDisplays();
}

// Initialize market overview (only called once)
function initMarketOverview() {
    // Create initial cards
    indicesList.innerHTML = '';
    mockIndices.forEach(index => {
        const card = document.createElement('div');
        card.className = 'index-card';
        card.innerHTML = `
            <div>
                <div class="index-name">${index.name}</div>
                <div class="price-change ${index.change >= 0 ? 'positive' : 'negative'}">
                    ${formatPercentage(index.change)}
                </div>
            </div>
            <div class="index-price">${formatCurrency(index.price)}</div>
        `;
        indicesList.appendChild(card);
    });

    // Initialize select options
    initializeSelectOptions();

    // Start price updates
    setInterval(randomizePrices, PRICE_UPDATE_INTERVAL);
}

// Initialize app
async function initializeApp() {
    try {
        initMarketOverview();
        const { data: { session } } = await window.supabaseClient.client.auth.getSession();
        if (session) {
            await Promise.all([
                loadPositions(),
                loadOrders()
            ]);
        }
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    } catch (error) {
        console.error('Error initializing app:', error);
        if (window.auth?.showError) {
            window.auth.showError('Failed to initialize application');
        }
    }
}

// Load positions (only "open" ones)
async function loadPositions() {
    try {
        const { data: positions, error } = await window.supabaseClient.client
            .from('positions')
            .select('*')
            .eq('status', 'open');

        if (error) throw error;

        positionsList.innerHTML = '';
        positions.forEach(position => {
            const card = document.createElement('div');
            card.className = 'position-card';
            const pnl = position.pnl || 0;
            
            card.innerHTML = `
                <div class="position-header">
                    <span class="position-title">${position.index_id} (${position.side.toUpperCase()})</span>
                    <span class="position-pnl ${pnl >= 0 ? 'positive' : 'negative'}">
                        ${formatCurrency(pnl)}
                    </span>
                </div>
                <div class="position-details">
                    <div>Quantity: ${position.quantity}</div>
                    <div>Entry Price: ${formatCurrency(position.entry_price)}</div>
                    <div>Current Price: ${formatCurrency(position.current_price)}</div>
                    <div>Status: ${position.status}</div>
                </div>
                <div class="button-group">
                    <button data-posid="${position.id}" class="close-pos-btn">Close Position</button>
                </div>
            `;
            positionsList.appendChild(card);
        });

        const closeButtons = document.querySelectorAll('.close-pos-btn');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', closePosition);
        });

    } catch (error) {
        console.error('Error loading positions:', error);
        if (window.auth?.showError) {
            window.auth.showError('Failed to load positions');
        }
    }
}

// Close position
async function closePosition(e) {
    const posId = e.target.dataset.posid;
    if (!posId) return;
    
    try {
        // Get position details first
        const { data: position, error: posError } = await window.supabaseClient.client
            .from('positions')
            .select('*')
            .eq('id', posId)
            .single();

        if (posError) throw posError;

        // Get current price for the index
        const currentIndex = mockIndices.find(idx => idx.id === position.index_id);
        if (!currentIndex) throw new Error('Index not found');

        const exitPrice = currentIndex.price;
        const finalPnL = calculatePnL(position, exitPrice);

        // Update position with exit price and final PnL
        const { error } = await window.supabaseClient.client
            .from('positions')
            .update({
                status: 'closed',
                exit_price: exitPrice,
                current_price: exitPrice,
                pnl: finalPnL,
                updated_at: new Date().toISOString()
            })
            .eq('id', posId);

        if (error) throw error;

        await loadPositions();
        if (window.auth?.showSuccess) {
            window.auth.showSuccess(`Position closed with P&L: ${formatCurrency(finalPnL)}`);
        }
    } catch (error) {
        console.error('Error closing position:', error);
        if (window.auth?.showError) {
            window.auth.showError('Failed to close position');
        }
    }
}

// Load orders
async function loadOrders() {
    try {
        const { data: orders, error } = await window.supabaseClient.client
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        ordersList.innerHTML = '';
        orders.forEach(order => {
            const card = document.createElement('div');
            card.className = 'order-card';
            card.innerHTML = `
                <div class="order-header">
                    <span class="order-title">${order.index_id}</span>
                    <span>${formatCurrency(order.total_value)}</span>
                </div>
                <div class="order-details">
                    <div>${order.order_type.toUpperCase()}</div>
                    <div>Qty: ${order.quantity}</div>
                    <div>Price: ${formatCurrency(order.price)}</div>
                    <div>Status: ${order.status}</div>
                    <div>Date: ${new Date(order.created_at).toLocaleString()}</div>
                </div>
            `;
            ordersList.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading orders:', error);
        if (window.auth?.showError) {
            window.auth.showError('Failed to load orders');
        }
    }
}

// Handle trade form submission
tradeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const { data: { session } } = await window.supabaseClient.client.auth.getSession();
        if (!session) {
            throw new Error('Please log in to place orders');
        }

        const formData = {
            index_id: indexSelect.value,
            order_type: document.getElementById('order-type').value,
            quantity: parseInt(document.getElementById('quantity').value)
        };

        const chosenIndex = mockIndices.find(idx => idx.id === formData.index_id);
        if (!chosenIndex) {
            throw new Error('Index not found. Please select a valid index.');
        }
        const currentPrice = chosenIndex.price;
        const totalValue = formData.quantity * currentPrice;

        const { data: orderResult, error: orderError } = await window.supabaseClient.client
            .from('orders')
            .insert([{
                ...formData,
                user_id: session.user.id,
                price: currentPrice,
                total_value: totalValue,
                status: 'completed',
                created_at: new Date().toISOString()
            }])
            .select();
        if (orderError) throw orderError;

        const { error: newPosErr } = await window.supabaseClient.client
            .from('positions')
            .insert([{
                user_id: session.user.id,
                index_id: formData.index_id,
                side: formData.order_type,
                quantity: formData.quantity,
                entry_price: currentPrice,
                current_price: currentPrice,
                pnl: 0,
                status: 'open',
                created_at: new Date().toISOString()
            }]);
        if (newPosErr) throw newPosErr;

        if (window.auth?.showSuccess) {
            window.auth.showSuccess('Order placed and position opened');
        }

        tradeForm.reset();
        await Promise.all([
            loadOrders(),
            loadPositions()
        ]);

    } catch (error) {
        console.error('Error placing order:', error);
        if (window.auth?.showError) {
            window.auth.showError(error.message || 'Failed to place order');
        }
    }
});

// Initialize when both Supabase and Auth are ready
let isSupabaseReady = false;
let isAuthReady = false;

window.addEventListener('supabaseReady', () => {
    isSupabaseReady = true;
    if (isAuthReady) initializeApp();
});

window.addEventListener('authReady', () => {
    isAuthReady = true;
    if (isSupabaseReady) initializeApp();
});

// Handle auth state changes
window.addEventListener('authStateChange', async ({ detail }) => {
    if (detail.user) {
        await Promise.all([
            loadPositions(),
            loadOrders()
        ]);
    } else {
        positionsList.innerHTML = '';
        ordersList.innerHTML = '';
    }
});
