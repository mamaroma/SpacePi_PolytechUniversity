import hashlib
import json
import os
import secrets
import zipfile
import io
from datetime import datetime, timezone

from ais_core.seal_participant import seal_run_blob

PACKAGE_VERSION = 1
SEALED_FILENAME = "run_sealed.aispkg"
SUBMISSION_FILENAME = "submission.aispkg"


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def write_input_csv(path, packets):
    import csv

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "ais_sentence"])
        writer.writerows(packets)


def create_run_package(work_dir, level, seed, packets, reference):
    os.makedirs(work_dir, exist_ok=True)
    input_name = f"input_level{level}.csv"
    input_path = os.path.join(work_dir, input_name)
    write_input_csv(input_path, packets)

    run_id = secrets.token_hex(8)
    created_at = datetime.now(timezone.utc).isoformat()
    input_hash = sha256_file(input_path)

    manifest = {
        "package_version": PACKAGE_VERSION,
        "run_id": run_id,
        "level": level,
        "created_at": created_at,
        "input_file": input_name,
        "input_hash": input_hash,
        "sealed_blob": seal_run_blob(seed, reference),
    }

    sealed_path = os.path.join(work_dir, SEALED_FILENAME)
    with open(sealed_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return {
        "run_id": run_id,
        "input_path": input_path,
        "sealed_path": sealed_path,
        "manifest": manifest,
    }


def load_manifest(work_dir):
    sealed_path = os.path.join(work_dir, SEALED_FILENAME)
    if not os.path.isfile(sealed_path):
        raise FileNotFoundError(
            f"Не найден файл запуска {SEALED_FILENAME}. Сначала сгенерируйте пакеты в main.py."
        )
    with open(sealed_path, "r", encoding="utf-8") as f:
        return json.load(f)


def verify_input_integrity(work_dir, manifest):
    input_path = os.path.join(work_dir, manifest["input_file"])
    if not os.path.isfile(input_path):
        return False, f"Отсутствует входной файл {manifest['input_file']}"
    actual = sha256_file(input_path)
    if actual != manifest["input_hash"]:
        return False, "Хеш входного файла не совпадает с манифестом (файл изменён)"
    return True, ""


def participant_output_path(work_dir, level):
    return os.path.join(work_dir, f"output_level{level}.csv")


def _detect_plugins_snapshot(work_dir):
    root = work_dir
    parent = os.path.dirname(work_dir)
    found = {"custom_decoder": False, "custom_map": False}
    for base in (root, parent):
        if os.path.isfile(os.path.join(base, "decoder.py")):
            found["custom_decoder"] = True
        if os.path.isfile(os.path.join(base, "map.py")):
            found["custom_map"] = True
    return found


def create_submission_package(work_dir, participant_name="", extra_files=None):
    manifest = load_manifest(work_dir)
    level = manifest["level"]
    output_path = participant_output_path(work_dir, level)
    if not os.path.isfile(output_path):
        raise FileNotFoundError(
            f"Сначала сохраните результат декодирования в output_level{level}.csv"
        )

    submission_meta = {
        "package_version": PACKAGE_VERSION,
        "participant_name": participant_name or "anonymous",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "manifest": manifest,
        "output_file": os.path.basename(output_path),
        "output_hash": sha256_file(output_path),
        "plugins": _detect_plugins_snapshot(work_dir),
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "submission_meta.json",
            json.dumps(submission_meta, ensure_ascii=False, indent=2),
        )
        zf.write(os.path.join(work_dir, SEALED_FILENAME), SEALED_FILENAME)
        zf.write(os.path.join(work_dir, manifest["input_file"]), manifest["input_file"])
        zf.write(output_path, os.path.basename(output_path))

        for rel_path in extra_files or []:
            abs_path = (
                os.path.join(work_dir, rel_path) if not os.path.isabs(rel_path) else rel_path
            )
            if os.path.isfile(abs_path):
                zf.write(abs_path, os.path.basename(abs_path))

        for plugin in ("decoder.py", "map.py"):
            plugin_path = os.path.join(os.path.dirname(work_dir), plugin)
            if os.path.isfile(plugin_path):
                zf.write(plugin_path, plugin)

        viz_path = os.path.join(work_dir, "visualization.html")
        if os.path.isfile(viz_path):
            zf.write(viz_path, "visualization.html")

        for optional in ("output_level3_routes.csv", "output_level4_spoof_zone.json"):
            opt_path = os.path.join(work_dir, optional)
            if os.path.isfile(opt_path):
                zf.write(opt_path, optional)

    out_path = os.path.join(work_dir, SUBMISSION_FILENAME)
    with open(out_path, "wb") as f:
        f.write(buf.getvalue())
    return out_path, submission_meta


def read_submission_package(path):
    with zipfile.ZipFile(path, "r") as zf:
        meta = json.loads(zf.read("submission_meta.json").decode("utf-8"))
        files = {name: zf.read(name) for name in zf.namelist()}
    return meta, files
