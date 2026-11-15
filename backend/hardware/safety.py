"""Safety controls for physical Braille output."""
import os

def motor_commands_enabled():
    return os.getenv("BRAILLE_MOTORS_ENABLED", "0") == "1"
