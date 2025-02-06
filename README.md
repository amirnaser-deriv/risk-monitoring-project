# Real-Time Risk Monitoring System: Executive Summary

This document provides an overview of the Real-Time Risk Monitoring System, a comprehensive solution designed to provide immediate insights into our trading positions, exposures, and associated risks related to gold and silver, including their derived indices. This system empowers proactive risk management and informed decision-making.

## Business Overview (Page 1)

The Real-Time Risk Monitoring System is a critical tool for managing our exposure to gold and silver markets. It consists of two primary interfaces:

1.  **Trading Site:** This platform allows our traders to execute trades on gold, silver, and related indices (Gold RSI Momentum, Gold RSI Contrarian, Silver RSI Momentum, Silver RSI Contrarian). The platform provides real-time price updates and immediate feedback on order execution.

2.  **Risk Dashboard:** This dashboard provides a comprehensive, real-time view of our overall risk profile. It displays key metrics such as total positions, gold and silver exposure, daily profit and loss (P&L), and an overall risk level (Low, Medium, High). Interactive charts visualize position distribution, risk exposure, P&L trends, and trading volume. The dashboard also generates alerts for critical events, such as high exposure levels, significant losses, or excessive position concentration.

**Key Benefits:**

*   **Real-time Visibility:** Continuous monitoring of market positions and risk metrics.
*   **Proactive Risk Management:** Early warning system for potential risks.
*   **Informed Decision-Making:** Data-driven insights to support strategic trading decisions.
*   **Improved Operational Efficiency:** Streamlined trading and risk management processes.
*   **Enhanced Security:** Role-based access control and secure data handling.

**System Functionality (High-Level):**

The system simulates trading activity and market fluctuations. The core logic resides in a Python-based "feed engine" that updates prices and calculates derived indices (RSI Momentum and Contrarian) for both gold and silver. These indices represent different trading strategies. The trading site allows simulated trades on these indices, and the risk dashboard aggregates this data to present a consolidated view of our risk exposure.

---

## Technical Overview (Page 2 Onwards)

### Features

#### Trading Site

*   User authentication with role-based access (client, risk\_manager).
*   Real-time price updates for tactical indices.
*   Position creation and management.
*   Order execution with instant feedback.

#### Risk Dashboard

*   Real-time position monitoring.
*   Key metrics with trend indicators:
    *   Total positions and distribution.
    *   Total exposure with percentage changes.
    *   Unrealized P&L tracking.
    *   Dynamic risk level assessment.
*   Visual analytics:
    *   Position distribution charts.
    *   Risk exposure breakdown.
    *   P&L trend analysis.
    *   Trading volume visualization.
*   Threshold-based alerts for:
    *   High exposure levels.
    *   Significant losses.
    *   Position concentration.

### Technology Stack

*   **Frontend:** HTML, CSS, JavaScript.
*   **Backend:**
    *   Supabase for database and authentication.
    *   Python WebSocket server for real-time price updates.
*   **Data Visualization:** Chart.js.
*   **Real-time Updates:** WebSocket and Supabase Realtime.

### Setup

1.  Install Python dependencies:

    ```bash
    cd real-time-risk-monitoring
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

2.  Set up Supabase tables and policies (refer to `setup/fix_positions_policies.sql` for the latest SQL setup).

3.  Start the price feed engine:

    ```bash
    python feed-engine.py
    ```

4.  Open the trading site and risk dashboard in your browser:

    *   Trading Site: `/trading-site/index.html`
    *   Risk Dashboard: `/risk-dashboard/index.html`

### Architecture

#### Components

*   **auth.js:** Handles user authentication and role-based access.
*   **price-updates.js:** Manages real-time price updates via WebSocket.
*   **position-updates.js:** Handles position tracking and updates.
*   **risk-dashboard.js:** Core risk monitoring functionality.
*   **charts.js:** Chart configurations and updates.
*   **feed-engine.py:** Simulates price updates for indices.

#### Data Flow

1.  Price updates flow from the feed engine via WebSocket.
2.  Position changes are tracked through Supabase Realtime.
3.  Risk metrics are calculated in real-time based on positions and prices.
4.  Charts and alerts update automatically as data changes.

### Risk Monitoring

#### Risk Levels

*   **High:** Score > 2.5
*   **Medium:** Score > 1.5
*   **Low:** Score ≤ 1.5

Risk scores are calculated based on:

*   Total exposure relative to thresholds.
*   P&L performance.
*   Position concentration.

#### Alert Thresholds

*   High Exposure: > $1,000,000
*   Significant Loss: < -$50,000
*   Position Concentration: > 20 open positions

### Security

*   Role-based access control (client, risk\_manager).
*   Row Level Security in Supabase.
*   Secure WebSocket connections.
*   Authentication required for all operations.

### Contributing

1.  Fork the repository.
2.  Create a feature branch.
3.  Commit your changes.
4.  Push to the branch.
5.  Create a Pull Request.
