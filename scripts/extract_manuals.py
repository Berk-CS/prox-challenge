import os
import json
import re

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    import pypdf
except ImportError:
    pypdf = None

PDF_FILES = {
    "owner-manual": "files/owner-manual.pdf",
    "quick-start-guide": "files/quick-start-guide.pdf",
    "selection-chart": "files/selection-chart.pdf"
}

OUTPUT_BASE = "public/extracted"

def clean_text(text):
    # Remove excessive whitespaces or lines but keep basic formatting
    text = re.sub(r'\n\s*\n', '\n\n', text)
    return text.strip()

def extract_manuals():
    print("Starting extraction pipeline...")
    
    if not fitz and not pypdf:
        print("Error: Neither PyMuPDF (fitz) nor pypdf is installed. Please install them.")
        return
        
    os.makedirs(OUTPUT_BASE, exist_ok=True)
    metadata = {}
    
    for key, path in PDF_FILES.items():
        if not os.path.exists(path):
            print(f"Warning: Manual file {path} not found. Skipping.")
            continue
            
        print(f"\nProcessing {key} from {path}...")
        
        text_dir = os.path.join(OUTPUT_BASE, "text", key)
        image_dir = os.path.join(OUTPUT_BASE, "images", key)
        os.makedirs(text_dir, exist_ok=True)
        os.makedirs(image_dir, exist_ok=True)
        
        metadata[key] = {
            "title": key.replace("-", " ").title(),
            "path": path,
            "pages": []
        }
        
        if fitz:
            doc = fitz.open(path)
            total_pages = len(doc)
            print(f"Using PyMuPDF (fitz) - Total pages: {total_pages}")
            
            for page_idx in range(total_pages):
                page_num = page_idx + 1
                page = doc.load_page(page_idx)
                
                # Extract text
                text = page.get_text("text")
                cleaned = clean_text(text)
                
                # Save text page as markdown
                md_filename = f"page_{page_num}.md"
                md_path = os.path.join(text_dir, md_filename)
                with open(md_path, "w", encoding="utf-8") as f:
                    f.write(f"# {key.replace('-', ' ').title()} - Page {page_num}\n\n")
                    f.write(cleaned)
                
                # Extract images
                image_list = page.get_images(full=True)
                image_records = []
                
                for img_idx, img in enumerate(image_list):
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image["ext"]
                    
                    img_filename = f"page_{page_num}_{img_idx + 1}.{image_ext}"
                    img_path = os.path.join(image_dir, img_filename)
                    
                    with open(img_path, "wb") as f:
                        f.write(image_bytes)
                        
                    # Relative path for frontend serving (starts with /extracted)
                    rel_img_url = f"/extracted/images/{key}/{img_filename}"
                    image_records.append({
                        "filename": img_filename,
                        "url": rel_img_url,
                        "index": img_idx + 1
                    })
                
                # Look for potential section keywords
                keywords = []
                lower_clean = cleaned.lower()
                if "duty cycle" in lower_clean or "duty-cycle" in lower_clean:
                    keywords.append("duty cycle")
                if "wiring" in lower_clean or "schematic" in lower_clean or "circuit" in lower_clean:
                    keywords.append("schematics")
                if "polarity" in lower_clean or "electrode" in lower_clean:
                    keywords.append("polarity")
                if "trouble" in lower_clean or "diagnostic" in lower_clean or "porosity" in lower_clean:
                    keywords.append("troubleshooting")
                if "mig" in lower_clean:
                    keywords.append("mig")
                if "tig" in lower_clean:
                    keywords.append("tig")
                if "stick" in lower_clean:
                    keywords.append("stick")
                if "flux" in lower_clean:
                    keywords.append("flux-cored")
                if "tension" in lower_clean or "feed" in lower_clean or "wire speed" in lower_clean:
                    keywords.append("wire-feed")
                
                page_meta = {
                    "page_number": page_num,
                    "text_file": f"/extracted/text/{key}/{md_filename}",
                    "images": image_records,
                    "keywords": keywords,
                    "preview_snippet": cleaned[:150].replace('\n', ' ') + "..."
                }
                metadata[key]["pages"].append(page_meta)
                
            doc.close()
        else:
            # Fallback to pypdf (does not easily support image extraction here, but does text)
            print("Using pypdf (fallback) - Image extraction will be skipped.")
            reader = pypdf.PdfReader(path)
            total_pages = len(reader.pages)
            
            for page_idx in range(total_pages):
                page_num = page_idx + 1
                page = reader.pages[page_idx]
                
                text = page.extract_text()
                cleaned = clean_text(text)
                
                md_filename = f"page_{page_num}.md"
                md_path = os.path.join(text_dir, md_filename)
                with open(md_path, "w", encoding="utf-8") as f:
                    f.write(f"# {key.replace('-', ' ').title()} - Page {page_num}\n\n")
                    f.write(cleaned)
                    
                lower_clean = cleaned.lower()
                keywords = []
                if "duty cycle" in lower_clean or "duty-cycle" in lower_clean:
                    keywords.append("duty cycle")
                if "wiring" in lower_clean or "schematic" in lower_clean:
                    keywords.append("schematics")
                if "polarity" in lower_clean:
                    keywords.append("polarity")
                if "trouble" in lower_clean or "porosity" in lower_clean:
                    keywords.append("troubleshooting")
                if "mig" in lower_clean:
                    keywords.append("mig")
                if "tig" in lower_clean:
                    keywords.append("tig")
                if "stick" in lower_clean:
                    keywords.append("stick")
                if "flux" in lower_clean:
                    keywords.append("flux-cored")
                
                page_meta = {
                    "page_number": page_num,
                    "text_file": f"/extracted/text/{key}/{md_filename}",
                    "images": [],
                    "keywords": keywords,
                    "preview_snippet": cleaned[:150].replace('\n', ' ') + "..."
                }
                metadata[key]["pages"].append(page_meta)
                
    # Save global metadata.json
    with open(os.path.join(OUTPUT_BASE, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
        
    print(f"\nExtraction completed! Extracted data saved to {OUTPUT_BASE}")

if __name__ == "__main__":
    extract_manuals()
