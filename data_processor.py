import os
import time
import random
import requests
from bs4 import BeautifulSoup
import pandas as pd
from telemetry_config import URLS_FILE, PROCESSED_DIR, REQUEST_DELAY, HEADERS

# Ensure the processed directory exists
os.makedirs(PROCESSED_DIR, exist_ok=True)

def save_urls_to_csv(urls, filename=URLS_FILE):
    """
    Save URLs to a CSV file, avoiding duplicates.

    Args:
        urls (list): List of URLs to save.
        filename (str): Path to the CSV file.
    """
    existing_urls = load_urls_from_csv(filename)
    new_urls = [url for url in urls if url not in existing_urls]
    if new_urls:
        df = pd.DataFrame(new_urls, columns=['URL'])
        df.to_csv(filename, mode='a', header=not os.path.exists(filename), index=False)
        print(f"Added {len(new_urls)} new URLs to {filename}")
    else:
        print("No new URLs to save.")

def load_urls_from_csv(filename=URLS_FILE):
    """
    Load URLs from a CSV file.

    Args:
        filename (str): Path to the CSV file.

    Returns:
        list: List of URLs.
    """
    if os.path.exists(filename):
        df = pd.read_csv(filename)
        return df['URL'].tolist()
    else:
        print(f"File {filename} not found.")
        return []

def process_urls(urls):
    """
    Process each URL: send GET request and parse the response.

    Args:
        urls (list): List of URLs to process.
    """
    for url in urls:
        try:
            time.sleep(random.uniform(*REQUEST_DELAY))  # Add delay to avoid server blocking
            response = requests.get(url, headers=HEADERS, timeout=10)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                # Example: extract title and save to a file
                title = soup.title.string if soup.title else "No Title"
                save_processed_data(url, title)
                print(f"Processed URL: {url}, Title: {title}")
            else:
                print(f"Failed to fetch {url}, Status Code: {response.status_code}")
        except Exception as e:
            print(f"Error processing URL {url}: {e}")

def save_processed_data(url, data):
    """
    Save processed data to a file in the processed directory.

    Args:
        url (str): URL being processed.
        data (str): Data to save.
    """
    filename = os.path.join(PROCESSED_DIR, f"{url.split('/')[-1]}.txt")
    with open(filename, 'w', encoding='utf-8') as file:
        file.write(data)
    print(f"Data saved to {filename}")

if __name__ == "__main__":
    # Load existing URLs
    urls = load_urls_from_csv()

    # Process and save data from URLs
    process_urls(urls)