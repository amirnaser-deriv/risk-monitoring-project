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
Reworked feed-engine.py to aggregate data from:
 1) Gold Price (random walk, like gold_price.py)
 2) RSI_Gold_mtm (RSI with momentum strategy) – here we now incorporate an actual portfolio reference to the 'Gold' price
 3) RSI_Gold_ctn (RSI with contrarian strategy) – similarly referencing the actual 'Gold' price

Each starts with $7,000 in cash and $3,000 worth of gold (fractional positions).
We push these three items as 'Gold', 'RSI_Gold_mtm', and 'RSI_Gold_ctn' to Supabase and broadcast them
to connected WebSocket clients. The portfolio value for RSI-based items is now influenced by the real gold price.

All previous database, positions, logs, etc. remain intact. The 'indices' table in Supabase
will have 'Gold', 'RSI_Gold_mtm', and 'RSI_Gold_ctn'.
"""

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ---------------------------
#  Configuration & Constants
# ---------------------------
GOLD_MIN = 1700.0
GOLD_MAX = 2100.0

RSI_MIN = 0.0
RSI_MAX = 100.0

UPPER_RSI_THRESHOLD = 65
LOWER_RSI_THRESHOLD = 35

# We'll keep track of 1 "unit" as 1 ounce or 1 share, etc.  
# RSI modes will buy/sell 1 unit at a time if there's enough cash or positions.

# Starting portfolio conditions: $7,000 in cash + $3,000 in gold
INITIAL_GOLD_PRICE = 1900.0  # used at initialization
INITIAL_CASH = 7000.0
INITIAL_GOLD_INVESTMENT = 3000.0
INITIAL_GOLD_POSITIONS = INITIAL_GOLD_INVESTMENT / INITIAL_GOLD_PRICE

# We'll hold a small structure for each of the three aggregated items.
AGGREGATED_DATA = {
    'Gold': {
        'min': GOLD_MIN,
        'max': GOLD_MAX,
        'current': INITIAL_GOLD_PRICE
    },

    'RSI_Gold_mtm': {
        'rsi': 50.0,
        'cash_balance': INITIAL_CASH,             # 7k
        'gold_positions': INITIAL_GOLD_POSITIONS, # 3000 / 1900
        'current': INITIAL_CASH + (INITIAL_GOLD_POSITIONS * INITIAL_GOLD_PRICE)  # Initial portfolio value
    },

    'RSI_Gold_ctn': {
        'rsi': 50.0,
        'cash_balance': INITIAL_CASH,
        'gold_positions': INITIAL_GOLD_POSITIONS,
        'current': INITIAL_CASH + (INITIAL_GOLD_POSITIONS * INITIAL_GOLD_PRICE)  # Initial portfolio value
    }
}

# Log initial state
logger.info("Initial state:")
logger.info(f"Gold price: ${INITIAL_GOLD_PRICE:.2f}")
logger.info(f"RSI_Gold_mtm: {INITIAL_GOLD_POSITIONS:.4f} gold @ ${INITIAL_GOLD_PRICE:.2f} + ${INITIAL_CASH:.2f} cash = ${AGGREGATED_DATA['RSI_Gold_mtm']['current']:.2f}")
logger.info(f"RSI_Gold_ctn: {INITIAL_GOLD_POSITIONS:.4f} gold @ ${INITIAL_GOLD_PRICE:.2f} + ${INITIAL_CASH:.2f} cash = ${AGGREGATED_DATA['RSI_Gold_ctn']['current']:.2f}")

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
    'Gold':  {'min': GOLD_MIN, 'max': GOLD_MAX, 'current': AGGREGATED_DATA['Gold']['current']},
    'RSI_Gold_mtm': {'min': 0.0, 'max': 999999.0, 'current': AGGREGATED_DATA['RSI_Gold_mtm']['current']},
    'RSI_Gold_ctn': {'min': 0.0, 'max': 999999.0, 'current': AGGREGATED_DATA['RSI_Gold_ctn']['current']}
}

# Initialize them in the DB
for idx_id, data in INDICES.items():
    supabase.table('indices').upsert({
        'id': idx_id,
        'name': idx_id,
        'current_price': data['current'],
        'updated_at': datetime.now(UTC).isoformat()
    }).execute()
logger.info("Initialized indices table with Gold, RSI_Gold_mtm, RSI_Gold_ctn")

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
    """Mimic gold_price for 'Gold'."""
    data = AGGREGATED_DATA['Gold']
    change = random.uniform(-2.0, 2.0)
    new_price = data['current'] + change
    new_price = max(GOLD_MIN, min(GOLD_MAX, new_price))
    data['current'] = new_price
    return new_price

def random_walk_rsi(rsi_val: float) -> float:
    """Random walk RSI in [-3, +3], clamp [0..100]."""
    fluctuation = random.uniform(-3, 3)
    new_rsi = rsi_val + fluctuation
    return max(RSI_MIN, min(RSI_MAX, new_rsi))

def rsi_momentum_logic(data):
    """Update RSI, then buy/sell gold positions if thresholds crossed, then compute new portfolio value."""
    # data has keys: rsi, cash_balance, gold_positions
    # 1) Update RSI
    new_rsi = random_walk_rsi(data['rsi'])
    data['rsi'] = new_rsi

    # 2) Momentum logic
    gold_price = AGGREGATED_DATA['Gold']['current']
    # if RSI > 65 => buy 1 gold
    if new_rsi > UPPER_RSI_THRESHOLD:
        if data['cash_balance'] >= gold_price:
            data['cash_balance'] -= gold_price
            data['gold_positions'] += 1.0
            logger.info(f"RSI_Gold_mtm: Bought 1 gold at {gold_price}, new positions: {data['gold_positions']}, cash: {data['cash_balance']}")
    # if RSI < 35 => sell 1 gold
    elif new_rsi < LOWER_RSI_THRESHOLD:
        if data['gold_positions'] > 0:
            data['gold_positions'] -= 1.0
            data['cash_balance'] += gold_price
            logger.info(f"RSI_Gold_mtm: Sold 1 gold at {gold_price}, new positions: {data['gold_positions']}, cash: {data['cash_balance']}")

    # 3) Recompute portfolio
    portfolio_val = data['cash_balance'] + data['gold_positions'] * gold_price
    data['current'] = portfolio_val
    return portfolio_val

def rsi_contrarian_logic(data):
    """RSI contrarian logic => if RSI>65 => sell gold, if RSI<35 => buy gold, then portfolio = cash + (positions * price)."""
    new_rsi = random_walk_rsi(data['rsi'])
    data['rsi'] = new_rsi

    gold_price = AGGREGATED_DATA['Gold']['current']
    if new_rsi > UPPER_RSI_THRESHOLD:
        # sell 1 gold (contrarian: high RSI = sell)
        if data['gold_positions'] > 0:
            data['gold_positions'] -= 1.0
            data['cash_balance'] += gold_price
            logger.info(f"RSI_Gold_ctn: Sold 1 gold at {gold_price}, new positions: {data['gold_positions']}, cash: {data['cash_balance']}")
    elif new_rsi < LOWER_RSI_THRESHOLD:
        # buy 1 gold (contrarian: low RSI = buy)
        if data['cash_balance'] >= gold_price:
            data['cash_balance'] -= gold_price
            data['gold_positions'] += 1.0
            logger.info(f"RSI_Gold_ctn: Bought 1 gold at {gold_price}, new positions: {data['gold_positions']}, cash: {data['cash_balance']}")

    portfolio_val = data['cash_balance'] + data['gold_positions'] * gold_price
    data['current'] = portfolio_val
    return portfolio_val

async def aggregator_update():
    """Update 'Gold' price, then update momentum RSI, contrarian RSI, broadcast & store each."""
    # 1) Update Gold
    gold_new = update_gold_price()
    INDICES['Gold']['current'] = gold_new
    await broadcast_update('price_update', {
        'index_id': 'Gold',
        'price': gold_new
    })
    await store_price_update('Gold', gold_new)
    logger.info(f"Updated Gold => {gold_new:.2f}")

    # 2) RSI_Gold_mtm
    mtm_data = AGGREGATED_DATA['RSI_Gold_mtm']
    val_mtm = rsi_momentum_logic(mtm_data)
    INDICES['RSI_Gold_mtm']['current'] = val_mtm
    await broadcast_update('price_update', {
        'index_id': 'RSI_Gold_mtm',
        'price': val_mtm
    })
    await store_price_update('RSI_Gold_mtm', val_mtm)
    logger.info(f"Updated RSI_Gold_mtm => {val_mtm:.2f}")

    # Broadcast position update for RSI_Gold_mtm
    await broadcast_update('position_update', {
        'index_id': 'RSI_Gold_mtm',
        'gold_positions': mtm_data['gold_positions'],
        'cash_balance': mtm_data['cash_balance']
    })

    # 3) RSI_Gold_ctn
    ctn_data = AGGREGATED_DATA['RSI_Gold_ctn']
    val_ctn = rsi_contrarian_logic(ctn_data)
    INDICES['RSI_Gold_ctn']['current'] = val_ctn
    await broadcast_update('price_update', {
        'index_id': 'RSI_Gold_ctn',
        'price': val_ctn
    })
    await store_price_update('RSI_Gold_ctn', val_ctn)
    logger.info(f"Updated RSI_Gold_ctn => {val_ctn:.2f}")

    # Broadcast position update for RSI_Gold_ctn
    await broadcast_update('position_update', {
        'index_id': 'RSI_Gold_ctn',
        'gold_positions': ctn_data['gold_positions'],
        'cash_balance': ctn_data['cash_balance']
    })

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
    logger.info("Starting feed engine aggregator with real gold-based RSI portfolios...")

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
