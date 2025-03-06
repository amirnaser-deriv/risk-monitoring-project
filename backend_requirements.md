# Risk Monitoring System - Backend Requirements Specification

## 1. Overview

This specification outlines the backend requirements needed to support real-time risk monitoring and aggregation for gold and silver trading positions. The focus is on providing necessary data and services to power the risk dashboard's position tracking and exposure monitoring capabilities.

## 2. Required Backend Services

### 2.1 Position Data Service
- **Real-time Position Updates**
  ```json
  {
    "position_id": "string",
    "instrument_id": "string",  // e.g., "Gold RSI Momentum", "Silver RSI Contrarian"
    "side": "string",          // "buy" or "sell"
    "quantity": "decimal",
    "entry_price": "decimal",
    "current_price": "decimal",
    "status": "string",        // "open" or "closed"
    "timestamp": "datetime"
  }
  ```

- **Position Aggregation Endpoints**
  ```
  GET /api/positions/aggregate
  Response:
  {
    "gold_positions": {
      "total_count": "integer",
      "buy_count": "integer",
      "sell_count": "integer",
      "net_exposure": "decimal"
    },
    "silver_positions": {
      "total_count": "integer",
      "buy_count": "integer",
      "sell_count": "integer",
      "net_exposure": "decimal"
    }
  }
  ```

### 2.2 Market Data Service
- **Real-time Price Updates**
  ```json
  {
    "instrument_id": "string",
    "price": "decimal",
    "timestamp": "datetime",
    "type": "string"  // "spot", "derived", etc.
  }
  ```

- **Required Price Streams**
  - Gold spot price
  - Silver spot price
  - Derived instrument prices (RSI indices)

### 2.3 Metal Position Service
- **RSI Position Updates**
  ```json
  {
    "index_id": "string",      // e.g., "Gold RSI Momentum"
    "gold_positions": "decimal",
    "silver_positions": "decimal",
    "timestamp": "datetime"
  }
  ```

## 3. WebSocket Requirements

### 3.1 Required Channels
```javascript
// Position Updates Channel
{
    "channel": "position_updates",
    "event": "update",
    "data": {
        // Position data structure as defined above
    }
}

// Price Updates Channel
{
    "channel": "price_updates",
    "event": "update",
    "data": {
        // Price data structure as defined above
    }
}

// Metal Position Updates Channel
{
    "channel": "metal_position_updates",
    "event": "update",
    "data": {
        // Metal position data structure as defined above
    }
}
```

## 4. Database Requirements

### 4.1 Required Tables
```sql
-- Positions tracking
CREATE TABLE positions (
    position_id UUID PRIMARY KEY,
    instrument_id VARCHAR(50) NOT NULL,
    side VARCHAR(4) NOT NULL,
    quantity DECIMAL(20,10) NOT NULL,
    entry_price DECIMAL(20,10) NOT NULL,
    current_price DECIMAL(20,10),
    status VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Metal positions for RSI indices
CREATE TABLE metal_positions (
    id UUID PRIMARY KEY,
    index_id VARCHAR(50) NOT NULL,
    gold_positions DECIMAL(20,10),
    silver_positions DECIMAL(20,10),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Price history
CREATE TABLE price_history (
    instrument_id VARCHAR(50) NOT NULL,
    price DECIMAL(20,10) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (instrument_id, timestamp)
);
```

## 5. Required Calculations

### 5.1 Exposure Calculations
```sql
-- Net Gold Exposure
SELECT 
    SUM(CASE 
        WHEN side = 'buy' THEN -quantity * current_price  -- Short when client buys
        ELSE quantity * current_price                     -- Long when client sells
    END) as net_exposure
FROM positions
WHERE instrument_id LIKE '%Gold%'
AND status = 'open';

-- Net Silver Exposure (similar calculation)
```

### 5.2 Position Aggregation
```sql
-- Position counts by metal
SELECT 
    instrument_id,
    COUNT(*) as total_positions,
    SUM(CASE WHEN side = 'buy' THEN 1 ELSE 0 END) as buy_positions,
    SUM(CASE WHEN side = 'sell' THEN 1 ELSE 0 END) as sell_positions
FROM positions
WHERE status = 'open'
GROUP BY instrument_id;
```

## 6. Performance Requirements

### 6.1 Data Freshness
- Position updates: Real-time (< 1 second delay)
- Price updates: Real-time (< 1 second delay)
- Aggregated metrics: Near real-time (< 2 seconds delay)

### 6.2 Query Performance
- Position aggregation queries: < 100ms
- Exposure calculations: < 200ms
- Historical data queries: < 500ms

## 7. Data Retention Requirements

### 7.1 Real-time Data
- Active positions: In-memory + database
- Current prices: In-memory cache
- Current exposures: In-memory cache

### 7.2 Historical Data
- Closed positions: 90 days
- Price history: 30 days
- Position snapshots: 30 days

## 8. Error Handling Requirements

### 8.1 Required Error States
```json
{
    "error_code": "string",
    "message": "string",
    "severity": "string",
    "timestamp": "datetime",
    "affected_positions": ["position_ids"],
    "recovery_action": "string"
}
```

### 8.2 Required Validations
- Position quantity limits
- Price deviation thresholds
- Exposure limits
- Data consistency checks

## 9. Authentication Requirements

### 9.1 Required Roles
- RISK_MANAGER: Full access to risk dashboard
- ADMIN: Full system access
- TRADER: Limited access to own positions

### 9.2 Required Permissions
- VIEW_POSITIONS
- VIEW_EXPOSURES
- VIEW_RISK_METRICS
- MANAGE_RISK_LIMITS
