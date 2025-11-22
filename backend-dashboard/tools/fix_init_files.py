import os

# Adjust this path if your folder structure is different
PROJECT_ROOT = "app"

def ensure_init_files(root: str):
    created = []

    for dirpath, dirnames, filenames in os.walk(root):
        # Ignore __pycache__ folders
        if "__pycache__" in dirpath:
            continue

        init_file = os.path.join(dirpath, "__init__.py")

        if not os.path.exists(init_file):
            with open(init_file, "w", encoding="utf-8") as f:
                f.write("# auto-generated __init__.py\n")
            created.append(init_file)

    if not created:
        print("✔ All folders already had __init__.py files!")
    else:
        print("✔ Created missing __init__.py files:")
        for f in created:
            print(" -", f)

if __name__ == "__main__":
    ensure_init_files(PROJECT_ROOT)
