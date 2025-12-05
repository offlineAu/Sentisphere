"""
Upload model to Hugging Face Hub.
Run: python upload_to_hf.py

You'll need to set your HF token first:
1. Go to https://huggingface.co/settings/tokens
2. Create a token with write access
3. Set it as environment variable or paste when prompted
"""

from huggingface_hub import HfApi, login
import os

# Your HF repo
REPO_ID = "OfflineAu/sentisphere-bisaya-sentiment"
MODEL_DIR = "models/bisaya-sentiment"

def main():
    # Login - will prompt for token if not set
    token = os.environ.get("HF_TOKEN")
    if token:
        login(token=token)
    else:
        print("Please enter your Hugging Face token (from https://huggingface.co/settings/tokens):")
        token = input().strip()
        login(token=token)
    
    api = HfApi()
    
    # Files to upload (only the final model, not checkpoints)
    files_to_upload = [
        "config.json",
        "model.safetensors",
        "special_tokens_map.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "training_args.bin",
        "training_config.json",
    ]
    
    print(f"\nUploading to {REPO_ID}...")
    
    for filename in files_to_upload:
        filepath = os.path.join(MODEL_DIR, filename)
        if os.path.exists(filepath):
            size_mb = os.path.getsize(filepath) / (1024 * 1024)
            print(f"  Uploading {filename} ({size_mb:.1f} MB)...")
            api.upload_file(
                path_or_fileobj=filepath,
                path_in_repo=filename,
                repo_id=REPO_ID,
                repo_type="model",
            )
            print(f"  Done: {filename}")
        else:
            print(f"  Skipping {filename} (not found)")
    
    print(f"\nUpload complete! View at: https://huggingface.co/{REPO_ID}")

if __name__ == "__main__":
    main()
