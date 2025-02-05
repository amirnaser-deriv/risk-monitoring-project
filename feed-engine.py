#!/usr/bin/env python3
import asyncio
import json
import random
import sys
import websockets
from websockets.server import serve
from supabase import create_client, Client
from datetime import datetime, UTC
from typing import Set, Dict
import logging

"""
Feed engine aggregates data from:
 1) Metal Prices (random walk)
    - Gold Price ($1700-$2100)
    - Silver Price ($20-$40)
 2) RSI Momentum Indices
    - RSI_Gold_mtm (follows gold price trends)
    - RSI_Silver_mtm (follows silver price trends)
 3) RSI Contrarian Indices
    - RSI_Gold_ctn (trades against gold price trends)
    - RSI_Silver_ctn (trades against silver price trends)

Each RSI index starts with:
- $7,000 in cash
- $3,000 worth of the respective metal (fractional positions)

The engine broadcasts prices and positions via WebSocket and stores them in Supabase.
RSI index values are influenced by their respective metal prices.
"""

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ---------------------------
#  Configuration & Constants
# ---------------------------
# Gold settings
GOLD_MIN = 1700.0
GOLD_MAX = 2100.0
INITIAL_GOLD_PRICE = 1900.0

# Silver settings
SILVER_MIN = 20.0
SILVER_MAX = 40.0
INITIAL_SILVER_PRICE = 30.0

# RSI settings
RSI_MIN = 0.0
RSI_MAX = 100.0
UPPER_RSI_THRESHOLD = 65
LOWER_RSI_THRESHOLD = 35

# We'll keep track of 1 "unit" as 1 ounce or 1 share, etc.  
# RSI modes will buy/sell 1 unit at a time if there's enough cash or positions.

# Starting portfolio conditions: $7,000 in cash + $3,000 in metal
INITIAL_CASH = 7000.0
INITIAL_INVESTMENT = 3000.0

# Calculate initial positions
INITIAL_GOLD_POSITIONS = INITIAL_INVESTMENT / INITIAL_GOLD_PRICE
INITIAL_SILVER_POSITIONS = INITIAL_INVESTMENT / INITIAL_SILVER_PRICE

# We'll hold a small structure for each of the aggregated items.
AGGREGATED_DATA = {
    'Gold': {
        'min': GOLD_MIN,
        'max': GOLD_MAX,
        'current': INITIAL_GOLD_PRICE
    },
    'Silver': {
        'min': SILVER_MIN,
        'max': SILVER_MAX,
        'current': INITIAL_SILVER_PRICE
    },
    'RSI_Gold_mtm': {
        'rsi': 50.0,
        'cash_balance': INITIAL_CASH,
        'gold_positions': INITIAL_GOLD_POSITIONS,
        'current': INITIAL_CASH + (INITIAL_GOLD_POSITIONS * INITIAL_GOLD_PRICE)
    },
    'RSI_Gold_ctn': {
        'rsi': 50.0,
        'cash_balance': INITIAL_CASH,
        'gold_positions': INITIAL_GOLD_POSITIONS,
        'current': INITIAL_CASH + (INITIAL_GOLD_POSITIONS * INITIAL_GOLD_PRICE)
    },
    'RSI_Silver_mtm': {
        'rsi': 50.0,
        'cash_balance': INITIAL_CASH,
        'silver_positions': INITIAL_SILVER_POSITIONS,
        'current': INITIAL_CASH + (INITIAL_SILVER_POSITIONS * INITIAL_SILVER_PRICE)
    },
    'RSI_Silver_ctn': {
        'rsi': 50.0,
        'cash_balance': INITIAL_CASH,
        'silver_positions': INITIAL_SILVER_POSITIONS,
        'current': INITIAL_CASH + (INITIAL_SILVER_POSITIONS * INITIAL_SILVER_PRICE)
    }
}

# Log initial state
logger.info("Initial state:")
logger.info(f"Gold price: ${INITIAL_GOLD_PRICE:.2f}")
logger.info(f"Silver price: ${INITIAL_SILVER_PRICE:.2f}")
logger.info(f"RSI_Gold_mtm: {INITIAL_GOLD_POSITIONS:.4f} gold @ ${INITIAL_GOLD_PRICE:.2f} + ${INITIAL_CASH:.2f} cash = ${AGGREGATED_DATA['RSI_Gold_mtm']['current']:.2f}")
logger.info(f"RSI_Gold_ctn: {INITIAL_GOLD_POSITIONS:.4f} gold @ ${INITIAL_GOLD_PRICE:.2f} + ${INITIAL_CASH:.2f} cash = ${AGGREGATED_DATA['RSI_Gold_ctn']['current']:.2f}")
logger.info(f"RSI_Silver_mtm: {INITIAL_SILVER_POSITIONS:.4f} silver @ ${INITIAL_SILVER_PRICE:.2f} + ${INITIAL_CASH:.2f} cash = ${AGGREGATED_DATA['RSI_Silver_mtm']['current']:.2f}")
logger.info(f"RSI_Silver_ctn: {INITIAL_SILVER_POSITIONS:.4f} silver @ ${INITIAL_SILVER_PRICE:.2f} + ${INITIAL_CASH:.2f} cash = ${AGGREGATED_DATA['RSI_Silver_ctn']['current']:.2f}")

# For storing to Supabase
from supabase.lib.client_options import ClientOptions

options = ClientOptions(
    schema='public',
    headers={'Content-Type': 'application/json','Accept': 'application/json'},
    auto_refresh_token=True,
    persist_session=True
)

supabase: Client = create_client(
    'https://jnnybkqyodxofussidmx.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impubnlia3F5b2R4b2Z1c3NpZG14Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTcxMzkyMCwiZXhwIjoyMDUxMjg5OTIwfQ.BSKchh3jynLHSZ1Jg2PX5io324f4R-jOujWLEKRPza0',
    options=options
)

try:
    response = supabase.table('indices').select('id').limit(1).execute()
    logger.info("Successfully connected to Supabase")
except Exception as e:
    logger.error(f"Error connecting to Supabase: {e}")
    sys.exit(1)

# We'll produce an INDICES dict to store current broadcast values to mirror AGGREGATED_DATA.
INDICES = {
    'Gold': {'min': GOLD_MIN, 'max': GOLD_MAX, 'current': AGGREGATED_DATA['Gold']['current']},
    'Silver': {'min': SILVER_MIN, 'max': SILVER_MAX, 'current': AGGREGATED_DATA['Silver']['current']},
    'RSI_Gold_mtm': {'min': 0.0, 'max': 999999.0, 'current': AGGREGATED_DATA['RSI_Gold_mtm']['current']},
    'RSI_Gold_ctn': {'min': 0.0, 'max': 999999.0, 'current': AGGREGATED_DATA['RSI_Gold_ctn']['current']},
    'RSI_Silver_mtm': {'min': 0.0, 'max': 999999.0, 'current': AGGREGATED_DATA['RSI_Silver_mtm']['current']},
    'RSI_Silver_ctn': {'min': 0.0, 'max': 999999.0, 'current': AGGREGATED_DATA['RSI_Silver_ctn']['current']}
}

# Clear existing indices first
try:
    supabase.table('indices').delete().neq('id', '').execute()
    logger.info("Cleared existing indices")
except Exception as e:
    logger.error(f"Error clearing indices: {e}")
    sys.exit(1)

# Initialize new indices in the DB
for idx_id, data in INDICES.items():
    supabase.table('indices').upsert({
        'id': idx_id,
        'name': idx_id,
        'current_price': data['current'],
        'updated_at': datetime.now(UTC).isoformat()
    }).execute()
logger.info("Initialized indices table with Gold, Silver, RSI_Gold_mtm, RSI_Gold_ctn, RSI_Silver_mtm, RSI_Silver_ctn")

connected_clients: Set[websockets.WebSocketServerProtocol] = set()

async def register_client(websocket: websockets.WebSocketServerProtocol):
    connected_clients.add(websocket)
    logger.info(f"Client connected. Total clients: {len(connected_clients)}")
    try:
        current_prices = {
            idx_id: {
                'price': data['current'],
                'timestamp': datetime.now(UTC).isoformat()
            }
            for idx_id, data in INDICES.items()
        }
        # Send initial snapshots
        try:
            # Send price snapshot
            await websocket.send(json.dumps({
                'type': 'snapshot',
                'data': current_prices
            }))
            logger.info("Sent initial price snapshot to client")

            # Send positions snapshot
            await websocket.send(json.dumps({
                'type': 'positions_snapshot',
                'data': {
                    'RSI_Gold_mtm': {
                        'gold_positions': AGGREGATED_DATA['RSI_Gold_mtm']['gold_positions'],
                        'cash_balance': AGGREGATED_DATA['RSI_Gold_mtm']['cash_balance']
                    },
                    'RSI_Gold_ctn': {
                        'gold_positions': AGGREGATED_DATA['RSI_Gold_ctn']['gold_positions'],
                        'cash_balance': AGGREGATED_DATA['RSI_Gold_ctn']['cash_balance']
                    },
                    'RSI_Silver_mtm': {
                        'silver_positions': AGGREGATED_DATA['RSI_Silver_mtm']['silver_positions'],
                        'cash_balance': AGGREGATED_DATA['RSI_Silver_mtm']['cash_balance']
                    },
                    'RSI_Silver_ctn': {
                        'silver_positions': AGGREGATED_DATA['RSI_Silver_ctn']['silver_positions'],
                        'cash_balance': AGGREGATED_DATA['RSI_Silver_ctn']['cash_balance']
                    }
                }
            }))
            logger.info("Sent initial positions snapshot to client")
        except websockets.ConnectionClosed:
            logger.warning("Client disconnected before receiving snapshot")
            return
        except Exception as e:
            logger.error(f"Error sending snapshot: {e}")
            return

        while True:
            try:
                message = await websocket.recv()
                if message == "ping":
                    await websocket.send("pong")
            except websockets.ConnectionClosed:
                break
            except Exception as e:
                logger.error(f"Error in client connection: {e}")
                break
    finally:
        connected_clients.remove(websocket)
        logger.info(f"Client disconnected. Total clients: {len(connected_clients)}")

async def broadcast_update(update_type: str, data: dict):
    if not connected_clients:
        return
    message = json.dumps({
        'type': update_type,
        'data': {
            **data,
            'timestamp': datetime.now(UTC).isoformat()
        }
    })
    dead_clients = set()
    for ws in connected_clients:
        try:
            await ws.send(message)
        except websockets.ConnectionClosed:
            dead_clients.add(ws)
        except Exception as e:
            logger.error(f"Error sending to client: {e}")
            dead_clients.add(ws)
    for ws in dead_clients:
        connected_clients.remove(ws)
        logger.info(f"Removed dead client. Total clients: {len(connected_clients)}")

async def store_price_update(index_id: str, price: float):
    try:
        data = {
            'id': index_id,
            'name': index_id,
            'current_price': price,
            'updated_at': datetime.now(UTC).isoformat()
        }
        response = supabase.table('indices').upsert(data).execute()
        if hasattr(response, 'error') and response.error:
            logger.error(f"Supabase error: {response.error}")
            return False
        return True
    except Exception as e:
        logger.error(f"Error storing price in Supabase: {str(e)}")
        try:
            supabase.auth.refresh_session()
            logger.info("Reconnected to Supabase")
        except Exception as re:
            logger.error(f"Failed to reconnect to Supabase: {str(re)}")
        return False

# ---------------------------
#   Random Walk + RSI Logic
# ---------------------------
def update_gold_price():
    """Random walk for Gold price."""
    data = AGGREGATED_DATA['Gold']
    change = random.uniform(-2.0, 2.0)
    new_price = data['current'] + change
    new_price = max(GOLD_MIN, min(GOLD_MAX, new_price))
    data['current'] = new_price
    return new_price

def update_silver_price():
    """Random walk for Silver price."""
    data = AGGREGATED_DATA['Silver']
    change = random.uniform(-0.1, 0.1)  # Smaller changes for silver due to lower price
    new_price = data['current'] + change
    new_price = max(SILVER_MIN, min(SILVER_MAX, new_price))
    data['current'] = new_price
    return new_price

def random_walk_rsi(rsi_val: float) -> float:
    """Random walk RSI in [-3, +3], clamp [0..100]."""
    fluctuation = random.uniform(-3, 3)
    new_rsi = rsi_val + fluctuation
    return max(RSI_MIN, min(RSI_MAX, new_rsi))

def rsi_momentum_logic(data, metal_type='gold'):
    """Update RSI, then buy/sell metal positions if thresholds crossed."""
    new_rsi = random_walk_rsi(data['rsi'])
    data['rsi'] = new_rsi

    metal_price = AGGREGATED_DATA[metal_type.capitalize()]['current']
    positions_key = f'{metal_type}_positions'

    # if RSI > 65 => buy 1 unit
    if new_rsi > UPPER_RSI_THRESHOLD:
        if data['cash_balance'] >= metal_price:
            data['cash_balance'] -= metal_price
            data[positions_key] += 1.0
            logger.info(f"RSI_{metal_type.capitalize()}_mtm: Bought 1 {metal_type} at {metal_price}, new positions: {data[positions_key]}, cash: {data['cash_balance']}")
    # if RSI < 35 => sell 1 unit
    elif new_rsi < LOWER_RSI_THRESHOLD:
        if data[positions_key] > 0:
            data[positions_key] -= 1.0
            data['cash_balance'] += metal_price
            logger.info(f"RSI_{metal_type.capitalize()}_mtm: Sold 1 {metal_type} at {metal_price}, new positions: {data[positions_key]}, cash: {data['cash_balance']}")

    # Recompute portfolio
    portfolio_val = data['cash_balance'] + data[positions_key] * metal_price
    data['current'] = portfolio_val
    return portfolio_val

def rsi_contrarian_logic(data, metal_type='gold'):
    """RSI contrarian logic => if RSI>65 => sell, if RSI<35 => buy."""
    new_rsi = random_walk_rsi(data['rsi'])
    data['rsi'] = new_rsi

    metal_price = AGGREGATED_DATA[metal_type.capitalize()]['current']
    positions_key = f'{metal_type}_positions'

    if new_rsi > UPPER_RSI_THRESHOLD:
        # sell 1 unit (contrarian: high RSI = sell)
        if data[positions_key] > 0:
            data[positions_key] -= 1.0
            data['cash_balance'] += metal_price
            logger.info(f"RSI_{metal_type.capitalize()}_ctn: Sold 1 {metal_type} at {metal_price}, new positions: {data[positions_key]}, cash: {data['cash_balance']}")
    elif new_rsi < LOWER_RSI_THRESHOLD:
        # buy 1 unit (contrarian: low RSI = buy)
        if data['cash_balance'] >= metal_price:
            data['cash_balance'] -= metal_price
            data[positions_key] += 1.0
            logger.info(f"RSI_{metal_type.capitalize()}_ctn: Bought 1 {metal_type} at {metal_price}, new positions: {data[positions_key]}, cash: {data['cash_balance']}")

    # Recompute portfolio
    portfolio_val = data['cash_balance'] + data[positions_key] * metal_price
    data['current'] = portfolio_val
    return portfolio_val

async def aggregator_update():
    """Update metal prices and RSI indices."""
    # 1) Update Gold
    gold_new = update_gold_price()
    INDICES['Gold']['current'] = gold_new
    await broadcast_update('price_update', {
        'index_id': 'Gold',
        'price': gold_new
    })
    await store_price_update('Gold', gold_new)
    logger.info(f"Updated Gold => {gold_new:.2f}")

    # 2) Update Silver
    silver_new = update_silver_price()
    INDICES['Silver']['current'] = silver_new
    await broadcast_update('price_update', {
        'index_id': 'Silver',
        'price': silver_new
    })
    await store_price_update('Silver', silver_new)
    logger.info(f"Updated Silver => {silver_new:.2f}")

    # 3) RSI_Gold_mtm
    mtm_gold_data = AGGREGATED_DATA['RSI_Gold_mtm']
    val_gold_mtm = rsi_momentum_logic(mtm_gold_data, 'gold')
    INDICES['RSI_Gold_mtm']['current'] = val_gold_mtm
    await broadcast_update('price_update', {
        'index_id': 'RSI_Gold_mtm',
        'price': val_gold_mtm
    })
    await store_price_update('RSI_Gold_mtm', val_gold_mtm)
    await broadcast_update('position_update', {
        'index_id': 'RSI_Gold_mtm',
        'gold_positions': mtm_gold_data['gold_positions'],
        'cash_balance': mtm_gold_data['cash_balance']
    })
    logger.info(f"Updated RSI_Gold_mtm => {val_gold_mtm:.2f}")

    # 4) RSI_Gold_ctn
    ctn_gold_data = AGGREGATED_DATA['RSI_Gold_ctn']
    val_gold_ctn = rsi_contrarian_logic(ctn_gold_data, 'gold')
    INDICES['RSI_Gold_ctn']['current'] = val_gold_ctn
    await broadcast_update('price_update', {
        'index_id': 'RSI_Gold_ctn',
        'price': val_gold_ctn
    })
    await store_price_update('RSI_Gold_ctn', val_gold_ctn)
    await broadcast_update('position_update', {
        'index_id': 'RSI_Gold_ctn',
        'gold_positions': ctn_gold_data['gold_positions'],
        'cash_balance': ctn_gold_data['cash_balance']
    })
    logger.info(f"Updated RSI_Gold_ctn => {val_gold_ctn:.2f}")

    # 5) RSI_Silver_mtm
    mtm_silver_data = AGGREGATED_DATA['RSI_Silver_mtm']
    val_silver_mtm = rsi_momentum_logic(mtm_silver_data, 'silver')
    INDICES['RSI_Silver_mtm']['current'] = val_silver_mtm
    await broadcast_update('price_update', {
        'index_id': 'RSI_Silver_mtm',
        'price': val_silver_mtm
    })
    await store_price_update('RSI_Silver_mtm', val_silver_mtm)
    await broadcast_update('position_update', {
        'index_id': 'RSI_Silver_mtm',
        'silver_positions': mtm_silver_data['silver_positions'],
        'cash_balance': mtm_silver_data['cash_balance']
    })
    logger.info(f"Updated RSI_Silver_mtm => {val_silver_mtm:.2f}")

    # 6) RSI_Silver_ctn
    ctn_silver_data = AGGREGATED_DATA['RSI_Silver_ctn']
    val_silver_ctn = rsi_contrarian_logic(ctn_silver_data, 'silver')
    INDICES['RSI_Silver_ctn']['current'] = val_silver_ctn
    await broadcast_update('price_update', {
        'index_id': 'RSI_Silver_ctn',
        'price': val_silver_ctn
    })
    await store_price_update('RSI_Silver_ctn', val_silver_ctn)
    await broadcast_update('position_update', {
        'index_id': 'RSI_Silver_ctn',
        'silver_positions': ctn_silver_data['silver_positions'],
        'cash_balance': ctn_silver_data['cash_balance']
    })
    logger.info(f"Updated RSI_Silver_ctn => {val_silver_ctn:.2f}")

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
