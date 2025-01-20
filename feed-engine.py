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

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Define indices with their price ranges
INDICES = {
    'TACTICAL_INDEX_1': {'min': 95.00, 'max': 105.00, 'current': 100.00},
    'TACTICAL_INDEX_2': {'min': 145.00, 'max': 155.00, 'current': 150.00},
    'TACTICAL_INDEX_3': {'min': 195.00, 'max': 205.00, 'current': 200.00}
}

# Initialize Supabase client with service role key
from supabase.lib.client_options import ClientOptions

options = ClientOptions(
    schema='public',
    headers={
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    auto_refresh_token=True,
    persist_session=True
)

supabase: Client = create_client(
    'https://jnnybkqyodxofussidmx.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impubnlia3F5b2R4b2Z1c3NpZG14Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTcxMzkyMCwiZXhwIjoyMDUxMjg5OTIwfQ.BSKchh3jynLHSZ1Jg2PX5io324f4R-jOujWLEKRPza0',
    options=options
)

# Test Supabase connection and create indices table if needed
try:
    # Test connection
    response = supabase.table('indices').select('id').limit(1).execute()
    logger.info("Successfully connected to Supabase")
    
    # Ensure indices table exists with initial data
    for index_id, data in INDICES.items():
        supabase.table('indices').upsert({
            'id': index_id,
            'name': f'Tactical Index {index_id[-1]}',
            'current_price': data['current'],
            'updated_at': datetime.now(UTC).isoformat()
        }).execute()
    logger.info("Initialized indices table")
except Exception as e:
    logger.error(f"Error connecting to Supabase: {e}")
    sys.exit(1)

# Store connected WebSocket clients
connected_clients: Set[websockets.WebSocketServerProtocol] = set()

async def register_client(websocket: websockets.WebSocketServerProtocol):
    """Register a new WebSocket client."""
    connected_clients.add(websocket)
    logger.info(f"Client connected. Total clients: {len(connected_clients)}")
    try:
        # Send current prices immediately upon connection
        current_prices = {
            index_id: {
                'price': data['current'],
                'timestamp': datetime.now(UTC).isoformat()
            }
            for index_id, data in INDICES.items()
        }
        try:
            await websocket.send(json.dumps({
                'type': 'snapshot',
                'data': current_prices
            }))
            logger.info(f"Sent initial snapshot to client")
        except websockets.ConnectionClosed:
            logger.warning(f"Client disconnected before receiving snapshot")
            return
        except Exception as e:
            logger.error(f"Error sending snapshot: {e}")
            return
        
        # Keep connection alive and handle ping/pong
        while True:
            try:
                # Wait for client message or connection close
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

async def broadcast_price_update(index_id: str, price: float):
    """Broadcast price update to all connected clients."""
    if not connected_clients:
        return
    
    message = json.dumps({
        'type': 'price_update',
        'data': {
            'index_id': index_id,
            'price': price,
            'timestamp': datetime.now(UTC).isoformat()
        }
    })
    
    # Broadcast to all connected clients
    dead_clients = set()
    for websocket in connected_clients:
        try:
            await websocket.send(message)
        except websockets.ConnectionClosed:
            dead_clients.add(websocket)
        except Exception as e:
            logger.error(f"Error sending to client: {e}")
            dead_clients.add(websocket)
    
    # Clean up dead clients
    for websocket in dead_clients:
        connected_clients.remove(websocket)
        logger.info(f"Removed dead client. Total clients: {len(connected_clients)}")

async def store_price_update(index_id: str, price: float):
    """Store price update in Supabase for historical data."""
    try:
        data = {
            'id': index_id,
            'name': f'Tactical Index {index_id[-1]}',
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
        # Try to reconnect to Supabase
        try:
            supabase.auth.refresh_session()
            logger.info("Reconnected to Supabase")
        except Exception as re:
            logger.error(f"Failed to reconnect to Supabase: {str(re)}")
        return False

async def update_price(index_id: str, data: dict):
    """Generate and handle a new price update."""
    try:
        # Random walk
        change = (random.random() - 0.5) * 2
        new_price = data['current'] + change

        # Keep price within bounds
        new_price = max(data['min'], min(data['max'], new_price))
        data['current'] = new_price

        # Broadcast to WebSocket clients
        await broadcast_price_update(index_id, new_price)
        
        # Store in Supabase
        await store_price_update(index_id, new_price)

        logger.info(f"Updated {index_id}: {new_price:.2f}")
        return True

    except Exception as e:
        logger.error(f"Error updating {index_id}: {e}")
        return False

async def price_generator():
    """Generate price updates for all indices."""
    while True:
        try:
            # Update each index
            for index_id, data in INDICES.items():
                await update_price(index_id, data)

            # Wait before next update
            await asyncio.sleep(2)  # Update every 2 seconds

        except Exception as e:
            logger.error(f"Error in price generator: {e}")
            await asyncio.sleep(5)  # Wait longer on error

async def health_check():
    """Monitor WebSocket connections and clean up stale ones."""
    while True:
        try:
            for websocket in connected_clients.copy():
                if not websocket.open:
                    connected_clients.remove(websocket)
            await asyncio.sleep(30)  # Check every 30 seconds
        except Exception as e:
            logger.error(f"Error in health check: {e}")
            await asyncio.sleep(30)

async def main():
    logger.info("Starting feed engine...")
    
    # Start WebSocket server
    websocket_server = await serve(
        register_client,
        "localhost",
        8765,
        ping_interval=20,
        ping_timeout=30
    )
    logger.info("WebSocket server running on ws://localhost:8765")
    logger.info("Pushing updates to indices table in Supabase")
    logger.info("Press Ctrl+C to stop")
    
    try:
        # Run price generator and health check concurrently
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
        # Clean up
        for websocket in connected_clients.copy():
            await websocket.close()

if __name__ == "__main__":
    asyncio.run(main())
