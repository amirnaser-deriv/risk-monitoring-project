# Real-Time Risk Monitoring System

A web-based platform for trading tactical indices with real-time risk monitoring capabilities.

## Project Structure

```
real-time-risk-monitoring/
├── database/
│   └── reset.sql              # Database schema and setup
├── shared/
│   ├── css/
│   │   └── styles.css         # Shared styles
│   └── js/
│       ├── auth.js            # Authentication handling
│       └── supabase-client.js # Supabase client setup
├── trading-site/
│   ├── css/
│   │   └── trading-site.css   # Trading site specific styles
│   ├── js/
│   │   └── trading-site.js    # Trading site functionality
│   └── index.html             # Trading site main page
└── risk-dashboard/           # Risk management dashboard (WIP)
```

## Features

- **Authentication**: User login/signup with role-based access control
- **Trading Interface**: Real-time market data and order placement
- **Position Tracking**: Live position monitoring with P/L updates
- **Order Management**: Historical order tracking and status updates

## Setup Instructions

1. **Database Setup**
   - Run the SQL in `database/reset.sql` in your Supabase SQL editor
   - This will create the necessary tables with proper structure and permissions

2. **Environment**
   - The Supabase client is already configured with the project URL and anon key
   - No additional environment setup needed

3. **Running the Application**
   - Open `trading-site/index.html` in a web browser
   - Login or create an account to start trading
   - Place orders and monitor positions in real-time

## Technical Details

### Database Schema

- **profiles**: User profiles with role-based access
- **positions**: Active and historical trading positions
- **orders**: Order history and status tracking

### Authentication

- Email/password authentication via Supabase Auth
- Role-based access control (client, admin, risk_manager)
- Automatic profile creation on signup

### Real-Time Features

- Live market data updates
- Real-time position tracking
- Instant order status updates

## Development Notes

1. **Market Data**
   - Currently using mock data for indices
   - TODO: Integrate real market data feed

2. **Risk Dashboard**
   - Work in progress
   - Will include:
     - Net open position monitoring
     - Aggregate exposure tracking
     - Risk threshold alerts

3. **Future Enhancements**
   - Advanced analytics
     - Position sizing recommendations
     - Risk metrics calculation
   - Email notifications for threshold breaches
   - Historical performance reporting
