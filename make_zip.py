"""Build otometierlist.zip: a download-and-run package with everything inside an 'otometierlist' folder.

Run:  python make_zip.py     (re-run after changing the app, then commit the new zip)
"""
import os, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
FOLDER = "otometierlist"
FILES = ["start-tierlist.bat", "start-tierlist.sh", "server.py", "HOW TO USE.txt"]
OUT = os.path.join(HERE, FOLDER + ".zip")

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    def add(path, arc):
        info = zipfile.ZipInfo.from_file(path, f"{FOLDER}/{arc}")
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (0o755 if arc.endswith(".sh") else 0o644) << 16  # keep the .sh runnable on Mac/Linux
        with open(path, "rb") as f:
            z.writestr(info, f.read())
    for name in FILES:
        add(os.path.join(HERE, name), name)
    for root, _, files in os.walk(os.path.join(HERE, "web")):
        for name in sorted(files):
            full = os.path.join(root, name)
            add(full, os.path.relpath(full, HERE).replace(os.sep, "/"))
print("wrote", OUT, f"({os.path.getsize(OUT) // 1024} KB)")
