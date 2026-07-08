import os
import fitz

PDF_FILES = {
    "owner-manual": "files/owner-manual.pdf",
    "quick-start-guide": "files/quick-start-guide.pdf",
    "selection-chart": "files/selection-chart.pdf"
}

OUTPUT_BASE = "public/extracted/pdf"

def split_pdf_pages():
    print("Starting PDF splitting pipeline...")
    os.makedirs(OUTPUT_BASE, exist_ok=True)
    
    for key, path in PDF_FILES.items():
        if not os.path.exists(path):
            print(f"Warning: Manual file {path} not found. Skipping.")
            continue
            
        print(f"\nProcessing {key} from {path}...")
        
        pdf_dir = os.path.join(OUTPUT_BASE, key)
        os.makedirs(pdf_dir, exist_ok=True)
        
        doc = fitz.open(path)
        total_pages = len(doc)
        print(f"Total pages: {total_pages}")
        
        for page_idx in range(total_pages):
            page_num = page_idx + 1
            pdf_filename = f"page_{page_num}.pdf"
            pdf_path = os.path.join(pdf_dir, pdf_filename)
            
            # Create a new 1-page PDF
            new_doc = fitz.open()
            new_doc.insert_pdf(doc, from_page=page_idx, to_page=page_idx)
            new_doc.save(pdf_path)
            new_doc.close()
            
            print(f"Saved {pdf_path}")
            
        doc.close()
    
    print("\nPDF splitting completed successfully!")

if __name__ == "__main__":
    split_pdf_pages()
