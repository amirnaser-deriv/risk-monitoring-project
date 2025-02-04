#!/usr/bin/env python3
import random
import time

"""
Simulates gold market prices with a random walk approach, producing data
(akin to an API feed) on a 1-second interval. Values are clamped within
a reasonable gold price range (e.g., 1700 to 2100 USD/oz).
"""

CURRENT_PRICE = 1900.0
MIN_PRICE = 1700.0
MAX_PRICE = 2100.0

def generate_gold_price():
    """
    Generate a gold price using small random fluctuations,
    clamped between MIN_PRICE and MAX_PRICE.
    """
    global CURRENT_PRICE
    # Allow small price changes in the range of -2 to +2
    fluctuation = random.uniform(-2.0, 2.0)
    CURRENT_PRICE += fluctuation
    # Clamp the price to [MIN_PRICE, MAX_PRICE]
    CURRENT_PRICE = max(min(CURRENT_PRICE, MAX_PRICE), MIN_PRICE)
    return CURRENT_PRICE

def main():
    print("Starting Gold Price feed simulation (1 sec interval). Press Ctrl+C to stop.")
    try:
        while True:
            price = generate_gold_price()
            print(f"Gold Price: {price:.2f} USD/oz")
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nSimulation interrupted. Exiting...")

if __name__ == '__main__':
    main()
