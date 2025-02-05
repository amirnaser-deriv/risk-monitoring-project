import asyncio
import json
import logging
import random
from websockets.server import serve

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s:%(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/feed-engine.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Constants
UPPER_RSI_THRESHOLD = 65
LOWER_RSI_THRESHOLD = 35

# Global state
connected_clients = set()

# Initialize data structures
INDICES = {
    'Gold Price': {'current': 1900.00},
    'Silver Price': {'current': 30.00},
    'Gold RSI Momentum': {'current': 10000.00},
    'Gold RSI Contrarian': {'current': 10000.00},
    'Silver RSI Momentum': {'current': 10000.00},
    'Silver RSI Contrarian': {'current': 10000.00}
}

AGGREGATED_DATA = {
    'Gold RSI Momentum': {
        'rsi': 50,
        'gold_positions': 1.5789,  # Initial position (7000/1900 = ~3.68 gold)
        'cash_balance': 7000.00,
        'current': 10000.00
    },
    'Gold RSI Contrarian': {
        'rsi': 50,
        'gold_positions': 1.5789,
        'cash_balance': 7000.00,
        'current': 10000.00
    },
    'Silver RSI Momentum': {
        'rsi': 50,
        'silver_positions': 100.00,  # Initial position (7000/30 = ~233.33 silver)
        'cash_balance': 7000.00,
        'current': 10000.00
    },
    'Silver RSI Contrarian': {
        'rsi': 50,
        'silver_positions': 100.00,
        'cash_balance': 7000.00,
        'current': 10000.00
    }
}

def random_walk_rsi(current_rsi, step_size=2):
    """Generate new RSI value using random walk."""
    new_rsi = current_rsi + random.uniform(-step_size, step_size)
    return max(0, min(100, new_rsi))

def update_gold_price():
    """Update gold price using random walk."""
    current = INDICES['Gold Price']['current']
    change = random.uniform(-2, 2)
    return max(1500, min(2300, current + change))

def update_silver_price():
    """Update silver price using random walk."""
    current = INDICES['Silver Price']['current']
    change = random.uniform(-0.1, 0.1)
    return max(20, min(40, current + change))

async def broadcast_update(update_type, data):
    """Send update to all connected clients."""
    if not connected_clients:
        return
        
    message = json.dumps({
        'type': update_type,
        'data': data
    })
    
    for websocket in connected_clients.copy():
        try:
            await websocket.send(message)
        except Exception as e:
            logger.error(f"Error sending to client: {e}")
            connected_clients.remove(websocket)

async def store_price_update(index_id, price):
    """Store price update in database."""
    # Implement if needed
    pass

async def register_client(websocket):
    """Handle new client connection."""
    connected_clients.add(websocket)
    logger.info(f"Client connected. Total clients: {len(connected_clients)}")
    
    try:
        # Send initial price snapshot
        prices = {
            index_id: data['current']
            for index_id, data in INDICES.items()
        }
        await websocket.send(json.dumps({
            'type': 'snapshot',
            'data': {
                index_id: {'price': price}
                for index_id, price in prices.items()
            }
        }))
        logger.info("Sent initial price snapshot to client")
        
        # Send initial positions snapshot
        positions = {
            'Gold RSI Momentum': {
                'gold_positions': AGGREGATED_DATA['Gold RSI Momentum']['gold_positions'],
                'cash_balance': AGGREGATED_DATA['Gold RSI Momentum']['cash_balance']
            },
            'Gold RSI Contrarian': {
                'gold_positions': AGGREGATED_DATA['Gold RSI Contrarian']['gold_positions'],
                'cash_balance': AGGREGATED_DATA['Gold RSI Contrarian']['cash_balance']
            },
            'Silver RSI Momentum': {
                'silver_positions': AGGREGATED_DATA['Silver RSI Momentum']['silver_positions'],
                'cash_balance': AGGREGATED_DATA['Silver RSI Momentum']['cash_balance']
            },
            'Silver RSI Contrarian': {
                'silver_positions': AGGREGATED_DATA['Silver RSI Contrarian']['silver_positions'],
                'cash_balance': AGGREGATED_DATA['Silver RSI Contrarian']['cash_balance']
            }
        }
        await websocket.send(json.dumps({
            'type': 'positions_snapshot',
            'data': positions
        }))
        logger.info("Sent initial positions snapshot to client")
        
        # Keep connection alive and handle incoming messages
        async for message in websocket:
            if message == "ping":
                await websocket.send("pong")
                
    except Exception as e:
        logger.error(f"Error in client handler: {e}")
    finally:
        connected_clients.remove(websocket)
        logger.info(f"Client disconnected. Total clients: {len(connected_clients)}")

def rsi_momentum_logic(data, metal_type='gold'):
    """Update RSI, then buy/sell metal positions if thresholds crossed."""
    new_rsi = random_walk_rsi(data['rsi'])
    data['rsi'] = new_rsi

    metal_price = INDICES[f'{metal_type.capitalize()} Price']['current']
    positions_key = f'{metal_type}_positions'

    # if RSI > 65 => buy 1 unit
    if new_rsi > UPPER_RSI_THRESHOLD:
        if data['cash_balance'] >= metal_price:
            data['cash_balance'] -= metal_price
            data[positions_key] += 1.0
            logger.info(f"{metal_type.capitalize()} RSI Momentum: Bought 1 {metal_type} at {metal_price}, new positions: {data[positions_key]}, cash: {data['cash_balance']}")
    # if RSI < 35 => sell 1 unit
    elif new_rsi < LOWER_RSI_THRESHOLD:
        if data[positions_key] > 0:
            data[positions_key] -= 1.0
            data['cash_balance'] += metal_price
            logger.info(f"{metal_type.capitalize()} RSI Momentum: Sold 1 {metal_type} at {metal_price}, new positions: {data[positions_key]}, cash: {data['cash_balance']}")

    # Recompute portfolio
    portfolio_val = data['cash_balance'] + data[positions_key] * metal_price
    data['current'] = portfolio_val
    return portfolio_val

def rsi_contrarian_logic(data, metal_type='gold'):
    """RSI contrarian logic => if RSI>65 => sell, if RSI<35 => buy."""
    new_rsi = random_walk_rsi(data['rsi'])
    data['rsi'] = new_rsi

    metal_price = INDICES[f'{metal_type.capitalize()} Price']['current']
    positions_key = f'{metal_type}_positions'

    if new_rsi > UPPER_RSI_THRESHOLD:
        # sell 1 unit (contrarian: high RSI = sell)
        if data[positions_key] > 0:
            data[positions_key] -= 1.0
            data['cash_balance'] += metal_price
            logger.info(f"{metal_type.capitalize()} RSI Contrarian: Sold 1 {metal_type} at {metal_price}, new positions: {data[positions_key]}, cash: {data['cash_balance']}")
    elif new_rsi < LOWER_RSI_THRESHOLD:
        # buy 1 unit (contrarian: low RSI = buy)
        if data['cash_balance'] >= metal_price:
            data['cash_balance'] -= metal_price
            data[positions_key] += 1.0
            logger.info(f"{metal_type.capitalize()} RSI Contrarian: Bought 1 {metal_type} at {metal_price}, new positions: {data[positions_key]}, cash: {data['cash_balance']}")

    # Recompute portfolio
    portfolio_val = data['cash_balance'] + data[positions_key] * metal_price
    data['current'] = portfolio_val
    return portfolio_val

async def aggregator_update():
    """Update metal prices and RSI indices."""
    # 1) Update Gold
    gold_new = update_gold_price()
    INDICES['Gold Price']['current'] = gold_new
    await broadcast_update('price_update', {
        'index_id': 'Gold Price',
        'price': gold_new,
        'name': 'Gold Price'  # Add name for consistency
    })
    await store_price_update('Gold Price', gold_new)
    logger.info(f"Updated Gold Price => {gold_new:.2f}")

    # 2) Update Silver
    silver_new = update_silver_price()
    INDICES['Silver Price']['current'] = silver_new
    await broadcast_update('price_update', {
        'index_id': 'Silver Price',
        'price': silver_new,
        'name': 'Silver Price'  # Add name for consistency
    })
    await store_price_update('Silver Price', silver_new)
    logger.info(f"Updated Silver Price => {silver_new:.2f}")

    # 3) Gold RSI Momentum
    mtm_gold_data = AGGREGATED_DATA['Gold RSI Momentum']
    val_gold_mtm = rsi_momentum_logic(mtm_gold_data, 'gold')
    INDICES['Gold RSI Momentum']['current'] = val_gold_mtm
    await broadcast_update('price_update', {
        'index_id': 'Gold RSI Momentum',
        'price': val_gold_mtm,
        'name': 'Gold RSI Momentum'  # Add name for consistency
    })
    await store_price_update('Gold RSI Momentum', val_gold_mtm)
    await broadcast_update('position_update', {
        'index_id': 'Gold RSI Momentum',
        'gold_positions': mtm_gold_data['gold_positions'],
        'cash_balance': mtm_gold_data['cash_balance']
    })
    logger.info(f"Updated Gold RSI Momentum => {val_gold_mtm:.2f}")

    # 4) Gold RSI Contrarian
    ctn_gold_data = AGGREGATED_DATA['Gold RSI Contrarian']
    val_gold_ctn = rsi_contrarian_logic(ctn_gold_data, 'gold')
    INDICES['Gold RSI Contrarian']['current'] = val_gold_ctn
    await broadcast_update('price_update', {
        'index_id': 'Gold RSI Contrarian',
        'price': val_gold_ctn,
        'name': 'Gold RSI Contrarian'  # Add name for consistency
    })
    await store_price_update('Gold RSI Contrarian', val_gold_ctn)
    await broadcast_update('position_update', {
        'index_id': 'Gold RSI Contrarian',
        'gold_positions': ctn_gold_data['gold_positions'],
        'cash_balance': ctn_gold_data['cash_balance']
    })
    logger.info(f"Updated Gold RSI Contrarian => {val_gold_ctn:.2f}")

    # 5) Silver RSI Momentum
    mtm_silver_data = AGGREGATED_DATA['Silver RSI Momentum']
    val_silver_mtm = rsi_momentum_logic(mtm_silver_data, 'silver')
    INDICES['Silver RSI Momentum']['current'] = val_silver_mtm
    await broadcast_update('price_update', {
        'index_id': 'Silver RSI Momentum',
        'price': val_silver_mtm,
        'name': 'Silver RSI Momentum'  # Add name for consistency
    })
    await store_price_update('Silver RSI Momentum', val_silver_mtm)
    await broadcast_update('position_update', {
        'index_id': 'Silver RSI Momentum',
        'silver_positions': mtm_silver_data['silver_positions'],
        'cash_balance': mtm_silver_data['cash_balance']
    })
    logger.info(f"Updated Silver RSI Momentum => {val_silver_mtm:.2f}")

    # 6) Silver RSI Contrarian
    ctn_silver_data = AGGREGATED_DATA['Silver RSI Contrarian']
    val_silver_ctn = rsi_contrarian_logic(ctn_silver_data, 'silver')
    INDICES['Silver RSI Contrarian']['current'] = val_silver_ctn
    await broadcast_update('price_update', {
        'index_id': 'Silver RSI Contrarian',
        'price': val_silver_ctn,
        'name': 'Silver RSI Contrarian'  # Add name for consistency
    })
    await store_price_update('Silver RSI Contrarian', val_silver_ctn)
    await broadcast_update('position_update', {
        'index_id': 'Silver RSI Contrarian',
        'silver_positions': ctn_silver_data['silver_positions'],
        'cash_balance': ctn_silver_data['cash_balance']
    })
    logger.info(f"Updated Silver RSI Contrarian => {val_silver_ctn:.2f}")

async def price_generator():
    """Called in a loop to update aggregator every 1 second."""
    while True:
        try:
            await aggregator_update()
            await asyncio.sleep(1)
        except Exception as e:
            logger.error(f"Error in aggregator logic: {e}")
            await asyncio.sleep(5)

async def health_check():
    while True:
        try:
            for ws in connected_clients.copy():
                if not ws.open:
                    connected_clients.remove(ws)
            await asyncio.sleep(30)
        except Exception as e:
            logger.error(f"Error in health check: {e}")
            await asyncio.sleep(30)

async def main():
    logger.info("Starting feed engine aggregator with metal prices and RSI portfolios...")

    # Perform an immediate aggregator update so initial RSI + portfolio reflect gold
    await aggregator_update()

    websocket_server = await serve(
        register_client,
        "localhost",
        8765,
        ping_interval=20,
        ping_timeout=30
    )
    logger.info("WebSocket server running on ws://localhost:8765")
    logger.info("Press Ctrl+C to stop")

    try:
        await asyncio.gather(
            price_generator(),
            health_check(),
            return_exceptions=True
        )
    except KeyboardInterrupt:
        logger.info("\nStopping feed engine...")
        websocket_server.close()
        await websocket_server.wait_closed()
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
    finally:
        for ws in connected_clients.copy():
            await ws.close()

if __name__ == "__main__":
    asyncio.run(main())
