#!/usr/bin/env python3
import random
import time
import sys

"""
Monitors RSI and Gold Price simultaneously to perform a simulated trading strategy.
We start with $7,000 in cash and the equivalent of $3,000 worth of gold already invested.
The simulation checks the RSI each second.

There are two strategies, selected via a command-line argument:
  1) "momentum": 
       - If RSI > 65 => BUY 1 unit of gold (if enough cash available)
       - If RSI < 35 => SELL 1 unit of gold (if any positions held)
  2) "contrarian": 
       - If RSI > 65 => SELL 1 unit of gold (if any positions held)
       - If RSI < 35 => BUY 1 unit of gold (if enough cash available)

Usage:
  python portfolio_simulator.py [strategy]
where [strategy] is either "momentum" or "contrarian". Defaults to "momentum" if none specified.

Portfolio value = cash + (gold_positions * gold_price)
"""

# Adjusted initial conditions
# $7,000 in cash, $3,000 allocated to gold at the start
INITIAL_CASH = 7000.0
gold_price_current = 1900.0
gold_positions = 3000.0 / gold_price_current  # fractional gold units

cash_balance = INITIAL_CASH

# Boundaries for RSI random walk
rsi_current = 50.0
RSI_MIN = 0.0
RSI_MAX = 100.0

# Boundaries for Gold random walk
GOLD_PRICE_MIN = 1700.0
GOLD_PRICE_MAX = 2100.0

# RSI thresholds for strategies
UPPER_RSI_THRESHOLD = 65
LOWER_RSI_THRESHOLD = 35

def generate_rsi_value():
    """
    Generate an RSI value in a random walk style,
    varying only by a small step around the current value,
    and clamping to [RSI_MIN, RSI_MAX].
    """
    global rsi_current
    fluctuation = random.uniform(-3, 3)
    rsi_current += fluctuation
    rsi_current = max(min(rsi_current, RSI_MAX), RSI_MIN)
    return rsi_current

def generate_gold_price():
    """
    Generate a gold price using small random fluctuations,
    clamped between GOLD_PRICE_MIN and GOLD_PRICE_MAX.
    """
    global gold_price_current
    fluctuation = random.uniform(-2.0, 2.0)
    gold_price_current += fluctuation
    gold_price_current = max(min(gold_price_current, GOLD_PRICE_MAX), GOLD_PRICE_MIN)
    return gold_price_current

def main():
    global cash_balance, gold_positions

    # Determine which strategy is requested
    if len(sys.argv) > 1:
        strategy = sys.argv[1].lower()
    else:
        strategy = "momentum"

    if strategy not in ("momentum", "contrarian"):
        print(f"Unrecognized strategy '{strategy}'. Defaulting to 'momentum'.")
        strategy = "momentum"

    print(f"Starting portfolio simulator with '{strategy}' strategy. Press Ctrl+C to stop.\n")
    print("Initial Portfolio:")
    print(f"  - Cash: ${cash_balance:,.2f}")
    print(f"  - Gold Positions: {gold_positions:.4f} units (≈ $3,000)")
    print()

    try:
        while True:
            # Generate new RSI and gold price
            rsi_value = generate_rsi_value()
            gold_price = generate_gold_price()

            # Evaluate the trading logic based on the chosen strategy
            if strategy == "momentum":
                # Momentum: BUY if RSI > 65, SELL if RSI < 35
                if rsi_value > UPPER_RSI_THRESHOLD:
                    # Attempt to buy 1 unit
                    if cash_balance >= gold_price:
                        gold_positions += 1
                        cash_balance -= gold_price
                        print(f"RSI {rsi_value:.2f} > {UPPER_RSI_THRESHOLD} => Bought 1 gold at ${gold_price:.2f}")
                    else:
                        print(f"RSI {rsi_value:.2f} > {UPPER_RSI_THRESHOLD} => Not enough cash to buy gold")
                elif rsi_value < LOWER_RSI_THRESHOLD:
                    # Attempt to sell 1 unit
                    if gold_positions > 0:
                        gold_positions -= 1
                        cash_balance += gold_price
                        print(f"RSI {rsi_value:.2f} < {LOWER_RSI_THRESHOLD} => Sold 1 gold at ${gold_price:.2f}")
                    else:
                        print(f"RSI {rsi_value:.2f} < {LOWER_RSI_THRESHOLD} => No gold to sell")

            else:  # contrarian
                # Contrarian: SELL if RSI > 65, BUY if RSI < 35
                if rsi_value > UPPER_RSI_THRESHOLD:
                    if gold_positions > 0:
                        gold_positions -= 1
                        cash_balance += gold_price
                        print(f"RSI {rsi_value:.2f} > {UPPER_RSI_THRESHOLD} => Sold 1 gold at ${gold_price:.2f}")
                    else:
                        print(f"RSI {rsi_value:.2f} > {UPPER_RSI_THRESHOLD} => No gold to sell")
                elif rsi_value < LOWER_RSI_THRESHOLD:
                    if cash_balance >= gold_price:
                        gold_positions += 1
                        cash_balance -= gold_price
                        print(f"RSI {rsi_value:.2f} < {LOWER_RSI_THRESHOLD} => Bought 1 gold at ${gold_price:.2f}")
                    else:
                        print(f"RSI {rsi_value:.2f} < {LOWER_RSI_THRESHOLD} => Not enough cash to buy gold")

            # Calculate total portfolio value
            portfolio_value = cash_balance + (gold_positions * gold_price)

            # Display updated info
            print(f"RSI: {rsi_value:.2f}, Gold: ${gold_price:.2f}, "
                  f"Positions: {gold_positions:.4f}, Cash: ${cash_balance:,.2f}, "
                  f"Portfolio Value: ${portfolio_value:,.2f}")

            # Wait 1 second
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nSimulation interrupted. Exiting...")

if __name__ == '__main__':
    main()
