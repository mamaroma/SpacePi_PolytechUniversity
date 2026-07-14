import importlib.util
import os
import sys


def project_root():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _search_paths(work_dir=None):
    paths = []
    if work_dir:
        paths.append(work_dir)
    paths.append(project_root())
    return paths


def find_plugin_file(name, work_dir=None):
    for base in _search_paths(work_dir):
        path = os.path.join(base, name)
        if os.path.isfile(path):
            return path
    return None


def load_decoder_module(work_dir=None):
    path = find_plugin_file("decoder.py", work_dir)
    if not path:
        return None, None
    spec = importlib.util.spec_from_file_location("participant_decoder", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, "decode_ais"):
        raise ValueError("decoder.py должен содержать функцию decode_ais(sentence)")
    return module, path


def load_map_module(work_dir=None):
    path = find_plugin_file("map.py", work_dir)
    if not path:
        return None, None
    spec = importlib.util.spec_from_file_location("participant_map_plugin", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, "visualize"):
        raise ValueError(
            "map.py должен содержать функцию visualize(input_csv, output_csv, output_html=None)"
        )
    return module, path


def detect_plugins(work_dir=None):
    decoder_path = find_plugin_file("decoder.py", work_dir)
    map_path = find_plugin_file("map.py", work_dir)
    return {
        "custom_decoder": decoder_path is not None,
        "custom_map": map_path is not None,
        "decoder_path": decoder_path,
        "map_path": map_path,
    }


def run_custom_decoder_on_packets(packets, work_dir=None):
    module, path = load_decoder_module(work_dir)
    if not module:
        return None, None
    rows = []
    for ts, pkt in packets:
        res = module.decode_ais(pkt)
        if res:
            row = dict(res)
            if "last_seen" not in row:
                row["last_seen"] = ts
            rows.append(row)
    return rows, path


def run_custom_visualization(input_csv, output_csv, output_html=None, work_dir=None):
    module, path = load_map_module(work_dir)
    if not module:
        return None, None
    result = module.visualize(input_csv, output_csv, output_html=output_html)
    return result if result is not None else output_html, path
