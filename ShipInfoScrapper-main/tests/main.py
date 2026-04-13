import requests
import pandas
from bs4 import BeautifulSoup
from user_agent import generate_user_agent
from stem import Signal
from stem.control import Controller


input_file = "AIS_decoded.csv"


# Функция для смены IP
def change_ip():
    with Controller.from_port(port=9051) as controller:
        controller.authenticate(password="spacez")  # Пароль из torrc
        controller.signal(Signal.NEWNYM)  # Команда "сменить IP"


def get_current_ip():
    response = requests.get("https://api.ipify.org?format=json", proxies=proxies)
    return response.json()['ip']


def get_vessel_info(mmsi):
    cookies = {
        "ROUTEID": ".2",
        "_ga": "GA1.1.648351330.1743420798",
        "_ga_0MB1EVE8B7": "GS1.1.1743428432.2.1.1743428568.0.0.0"
    }
    headers = {
        "User-agent": generate_user_agent()
    }

    # print(f"https://www.vesselfinder.com/vessels/details/{mmsi}")
    res = requests.get(f"https://www.vesselfinder.com/vessels/details/{mmsi}", cookies=cookies, headers=headers)

    print("Текущий IP:", get_current_ip())
    change_ip()
    print("Новый IP:", get_current_ip())

    soup = BeautifulSoup(res.text, features="html.parser")
    flag_1 = soup.find(name="table", class_="aparams")
    flag_2 = flag_1.find("td", class_="n3", string='Flag')
    country = flag_2.find_next_sibling('td').text
    photourl = soup.find(name="img", class_="main-photo").get("src")
    print(photourl)
    


proxies = {
    'http': 'socks5://127.0.0.1:9050',
    'https': 'socks5://127.0.0.1:9050'
}


data = pandas.read_csv(input_file, sep=";")
for i in range(1000):
    vessel = data.iloc[i]
    mmsi = vessel["mmsi"]
    get_vessel_info(mmsi)
