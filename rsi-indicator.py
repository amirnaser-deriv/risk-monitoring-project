#!/usr/bin/env python3
import random
import time

# We'll maintain a global RSI value that changes slightly over time.
# The user wants smaller fluctuations. We'll use a "random walk" approach 
# with bounded values to simulate consecutive RSI values that don't 
# jump drastically.

current_rsi = 50.0  # Start near the middle of the RSI range.

def generate_rsi_value():
    """
    Generate a single RSI value in a random walk style,
    varying only by a small step around the current value, 
    and clamp to [0, 100].
    """
    global current_rsi
    # We'll allow small fluctuations in the range of -3 to +3 each step
    fluctuation = random.uniform(-3, 3)
    current_rsi += fluctuation
    # Clamp RSI to [0, 100]
    current_rsi = max(min(current_rsi, 100.0), 0.0)
    return current_rsi

def main():
    print("Starting RSI data stream (1 sec interval). Press Ctrl+C to stop.")
    try:
        while True:
            rsi_value = generate_rsi_value()
            print(f"RSI: {rsi_value:.2f}")
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nData stream interrupted. Exiting...")

if __name__ == '__main__':
    main()
