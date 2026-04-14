import os
import re

def replace_term(match):
    word = match.group(0)
    if word == 'atlas':
        return 'atlas'
    elif word == 'Atlas':
        return 'Atlas'
    elif word == 'ATLAS':
        return 'ATLAS'
    elif word == 'Atlas':
        return 'Atlas'
    else:
        # Default fallback, capitalize as Atlas
        return 'Atlas'

def replace_in_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception:
        # Try with latin-1 if utf-8 fails
        try:
            with open(filepath, 'r', encoding='latin-1') as f:
                content = f.read()
        except:
            return False
            
    new_content = re.sub(re.compile(r'atlas', re.IGNORECASE), replace_term, content)
    
    if new_content != content:
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            return True
        except:
            pass
    return False

def replace_in_directory(dir_path):
    exclude_dirs = {'.git', 'node_modules', '.next', '__pycache__', 'staticfiles', 'media', '.vscode', '.idea', 'venv', '.venv'}
    exclude_exts = {'.png', '.jpg', '.jpeg', '.gif', '.ico', '.sqlite3', '.pyc', '.pdf', '.zip', '.map'}
    
    count = 0
    for root, dirs, files in os.walk(dir_path):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in exclude_exts:
                continue
            
            filepath = os.path.join(root, file)
            if replace_in_file(filepath):
                print(f"Updated: {filepath}")
                count += 1
    return count

if __name__ == '__main__':
    directory = r"c:\Users\yuri.menezes\Desktop\Projetos\atlas"
    count = replace_in_directory(directory)
    print(f"Total files updated: {count}")
