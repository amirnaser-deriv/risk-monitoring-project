# Real-Time Risk Monitoring System

A real-time risk monitoring system for tracking trading positions, exposures, and risk metrics across tactical indices.

## Features

### Trading Site
- User authentication with role-based access
- Real-time price updates for tactical indices
- Position creation and management
- Order execution with instant feedback

### Risk Dashboard
- Real-time position monitoring
- Key metrics with trend indicators:
  - Total positions and distribution
  - Total exposure with percentage changes
  - Daily P&L tracking
  - Dynamic risk level assessment
- Visual analytics:
  - Position distribution charts
  - Risk exposure breakdown
  - P&L trend analysis
  - Trading volume visualization
- Threshold-based alerts for:
  - High exposure levels
  - Significant losses
  - Position concentration

## Technology Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: 
  - Supabase for database and authentication
  - Python WebSocket server for real-time price updates
- **Data Visualization**: Chart.js
- **Real-time Updates**: WebSocket and Supabase Realtime

## Setup

1. Install Python dependencies:
```bash
cd real-time-risk-monitoring
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. Set up Supabase tables and policies:
```sql
-- Create tables
create table public.indices (
    id text primary key,
    name text not null,
    current_price decimal not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.positions (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users not null,
    index_id text references public.indices not null,
    side text check (side in ('buy', 'sell')) not null,
    quantity integer not null check (quantity > 0),
    entry_price decimal not null,
    current_price decimal not null,
    status text check (status in ('open', 'closed')) not null default 'open',
    pnl decimal default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    closed_at timestamp with time zone,
    final_pnl decimal
);

-- Enable RLS
alter table public.indices enable row level security;
alter table public.positions enable row level security;

-- Set up RLS policies
create policy "Indices are viewable by authenticated users"
    on public.indices for select
    to authenticated
    using (true);

create policy "Users can view their own positions"
    on public.positions for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Risk managers can view all positions"
    on public.positions for select
    to authenticated
    using (exists (
        select 1 from public.profiles
        where id = auth.uid()
        and role = 'risk_manager'
    ));
```

3. Start the price feed engine:
```bash
python feed-engine.py
```

4. Open the trading site and risk dashboard in your browser:
- Trading Site: `/trading-site/index.html`
- Risk Dashboard: `/risk-dashboard/index.html`

## Architecture

### Components

- **auth.js**: Handles user authentication and role-based access
- **price-updates.js**: Manages real-time price updates via WebSocket
- **position-updates.js**: Handles position tracking and updates
- **risk-dashboard.js**: Core risk monitoring functionality
- **charts.js**: Chart configurations and updates
- **feed-engine.py**: Simulates price updates for indices

### Data Flow

1. Price updates flow from the feed engine via WebSocket
2. Position changes are tracked through Supabase Realtime
3. Risk metrics are calculated in real-time based on positions and prices
4. Charts and alerts update automatically as data changes

## Risk Monitoring

### Risk Levels

- **High**: Score > 2.5
- **Medium**: Score > 1.5
- **Low**: Score ≤ 1.5

Risk scores are calculated based on:
- Total exposure relative to thresholds
- P&L performance
- Position concentration

### Alert Thresholds

- High Exposure: > $1,000,000
- Significant Loss: < -$50,000
- Position Concentration: > 20 open positions

## Security

- Role-based access control (client, risk_manager)
- Row Level Security in Supabase
- Secure WebSocket connections
- Authentication required for all operations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
