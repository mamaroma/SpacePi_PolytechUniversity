"""Утилиты для GUI на macOS."""
import sys


def bring_tk_window_to_front(root):
    root.lift()
    root.attributes("-topmost", True)
    root.after(200, lambda: root.attributes("-topmost", False))
    root.focus_force()
    if sys.platform == "darwin":
        try:
            root.call("wm", "attributes", ".", "-topmost", "1")
            root.after(200, lambda: root.call("wm", "attributes", ".", "-topmost", "0"))
        except Exception:
            pass


def startup_message(text):
    print(text, flush=True)
