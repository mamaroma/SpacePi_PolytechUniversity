import logging
import random

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("app.log"),
        logging.StreamHandler()
    ]
)

def get_random_user_agent():
    """
    Return a random User-Agent string from a predefined list.

    Returns:
        str: A random User-Agent string.
    """
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0"
    ]
    return random.choice(user_agents)

def log_info(message):
    """
    Log an informational message.

    Args:
        message (str): The message to log.
    """
    logging.info(message)

def log_error(message):
    """
    Log an error message.

    Args:
        message (str): The message to log.
    """
    logging.error(message)

def log_warning(message):
    """
    Log a warning message.

    Args:
        message (str): The message to log.
    """
    logging.warning(message)

if __name__ == "__main__":
    # Example usage
    log_info("Application started.")
    print(f"Random User-Agent: {get_random_user_agent()}")
    log_info("Application finished.")