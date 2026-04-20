from flask import Flask, redirect, make_response, send_from_directory
from flask import render_template, Response
import config
from waitress import serve
from flask import request
import db_helper
import datetime


app = Flask(__name__)


@app.route("/")
def index():
    return render_template("map.html")


@app.route("/api/get-all-vessels")
def get_all_vessels():
    datetime_str = request.args.get('datetime')
    if datetime_str is None:
        datetime_data = datetime.datetime.now(datetime.timezone.utc)
    else:
        try:
            datetime_data = datetime.datetime.strptime(datetime_str, '%Y-%m-%dT%H:%M:%S')
        except ValueError:
            return {"status": "error", "message": "Invalid datetime format. Use 'YYYY-MM-DDTHH:MM:SS'"}
    vessels = db_helper.vessels.get_all_vessels_coords(datetime_data)
    # for i in range(len(vessels)):
    #     vessels[i]['type'] = 
    return {"status": "ok", "vessels": vessels}


@app.route("/api/get-vessel-info")
def get_vessel_info():
    mmsi = request.args.get('mmsi')
    if mmsi is None:
        return {"status": "error", "message": "No mmsi provided"}
    vessel = db_helper.vessels.get_vessel_info(mmsi)
    return {"status": "ok", "vessel": vessel}


@app.route("/api/search-vessels")
def search_vessels():
    query = request.args.get('query')
    if query is None:
        return {"status": "error", "message": "No query provided"}
    results = db_helper.vessels.search_vessel(query)
    return {"status": "ok", "results": results}


@app.route("/api/track-vessel")
def track_vessel():
    mmsi = request.args.get('mmsi')
    start = request.args.get('start')
    stop = request.args.get('stop')
    if start is None or stop is None:
        return {"status": "error", "message": "start or stop dates are not provided"}
    else:
        try:
            start = datetime.datetime.strptime(start, '%Y-%m-%dT%H:%M:%S')
            stop = datetime.datetime.strptime(stop, '%Y-%m-%dT%H:%M:%S')
        except ValueError:
            return {"status": "error", "message": "Invalid datetime format. Use 'YYYY-MM-DDTHH:MM:SS'"}
        
    results = db_helper.vessels.get_vessel_points(mmsi, start, stop)
    return {"status": "ok", "results": results}

# @app.errorhandler(404)
# def page_not_found(e):
#     return


if __name__ == "__main__":
    if config.DEBUG:
        app.run(port=5000, debug=True, host=config.DEBUG_HOST, use_reloader=False)
    else:
        serve(app, host="0.0.0.0", port=5000, url_scheme="https", threads=100)
