import config


conn_credentials = {
    "dbname": config.DB_NAME,
    "user": config.DB_USER,
    "password": config.DB_PASSWORD,
    "host": config.DB_HOST,
}


from . import _db_cmd
from . import vessels
