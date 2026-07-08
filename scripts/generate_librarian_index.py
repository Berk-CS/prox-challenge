import os
import json
import base64
import glob
import re
import sys

# Try importing dependencies
try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF (fitz) is not installed. Run: pip install pymupdf")
    sys.exit(1)

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package is not installed. Run: pip install openai")
    OpenAI = None

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SYSTEM_PROMPT = """You are a meticulous technical documentation librarian.
Your task is to analyze pages of a product manual and construct a structured section map.

For the batch of pages provided, return a JSON object with a single key "sections" containing an array of sections.

Each section must follow this schema:
{
  "title": "Section Title",
  "pages": [page_numbers_in_this_section],
  "visuals": [
    {
      "page": page_number,
      "description": "Detailed description of diagram, table, chart, or visual asset on this page and its purpose."
    }
  ]
}

CRITICAL RULES:
1. If a page contains a clear, new heading or section start, create a new section entry.
2. If the initial pages of this batch do not start with a heading and are just continuing text from the previous page, you MUST group them under a section titled 'CONTINUATION'.
3. If there are technical diagrams, charts, schematics, or key visuals (such as controls, wiring, weld defects, setup illustrations), you MUST include them in the 'visuals' list with a highly detailed description of what the visual depicts, its labels, and its technical purpose. If no visual is present on a page, 'visuals' should be empty or omitted.
4. All page numbers in the output must match the actual page numbers of the manual page images.
"""

def pdf_page_to_base64_png(pdf_path):
    doc = fitz.open(pdf_path)
    page = doc.load_page(0)  # Each pdf_path is a single-page PDF
    pix = page.get_pixmap(dpi=150)
    png_bytes = pix.tobytes("png")
    doc.close()
    return base64.b64encode(png_bytes).decode("utf-8")

def run_batch_indexing(pdf_dir, output_file, start_page=1, end_page=None, batch_size=5, source="owner-manual"):
    if not OpenAI:
        print("Error: OpenAI client not available. Install 'openai' package.")
        return
        
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not found in .env or system environment.")
        return
        
    client = OpenAI(api_key=api_key)
    
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    
    # List all page PDFs and sort them by page number
    pdf_pattern = os.path.join(pdf_dir, "page_*.pdf")
    pdf_files = glob.glob(pdf_pattern)
    
    # Extract page number to sort numerically
    def get_page_num(filepath):
        basename = os.path.basename(filepath)
        match = re.search(r'page_(\d+)\.pdf', basename)
        return int(match.group(1)) if match else 9999
        
    pdf_files.sort(key=get_page_num)
    
    # Filter by page range if specified
    filtered_pdfs = []
    for f in pdf_files:
        p_num = get_page_num(f)
        if start_page <= p_num:
            if end_page is None or p_num <= end_page:
                filtered_pdfs.append((p_num, f))
                
    if not filtered_pdfs:
        print(f"No PDF files match the criteria in {pdf_dir}.")
        return
        
    print(f"Found {len(filtered_pdfs)} pages to process in batches of {batch_size} for source '{source}'.")
    
    # Process in batches
    for i in range(0, len(filtered_pdfs), batch_size):
        batch = filtered_pdfs[i:i+batch_size]
        batch_page_nums = [item[0] for item in batch]
        print(f"\nProcessing Batch: pages {batch_page_nums} ({source})")
        
        # Prepare content blocks
        content = [
            {
                "type": "text",
                "text": f"Analyze the following manual pages from '{source}': {batch_page_nums}. Identify section headings and visual assets (diagrams, flowcharts, schematics, charts)."
            }
        ]
        
        for p_num, f_path in batch:
            try:
                b64_img = pdf_page_to_base64_png(f_path)
                content.append({"type": "text", "text": f"--- Start of Page {p_num} ---"})
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{b64_img}"
                    }
                })
            except Exception as e:
                print(f"Error converting page {p_num} to image: {e}")
                continue
                
        # Send to OpenAI
        try:
            model = "gpt-4o"
            print(f"Sending request to {model}...")
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": SYSTEM_PROMPT
                    },
                    {
                        "role": "user",
                        "content": content
                    }
                ],
                response_format={"type": "json_object"},
                max_tokens=4000,
                temperature=0.0
            )
            
            result_text = response.choices[0].message.content
            batch_result = json.loads(result_text)
            
            # Load existing raw index if it exists
            if os.path.exists(output_file):
                try:
                    with open(output_file, "r", encoding="utf-8") as f:
                        existing_data = json.load(f)
                except Exception as e:
                    print(f"Warning: Could not read existing file {output_file}: {e}. Starting fresh.")
                    existing_data = {"sections": []}
            else:
                existing_data = {"sections": []}
            
            # Migration/Normalization: ensure all existing sections have a "source" key
            for sec in existing_data.get("sections", []):
                if "source" not in sec:
                    sec["source"] = "owner-manual"
                    
            # Set source in new sections
            for sec in batch_result.get("sections", []):
                sec["source"] = source
            
            # Filter out any existing sections that contain any of the newly processed page numbers for the SAME source
            new_pages_set = set(batch_page_nums)
            filtered_sections = []
            for sec in existing_data.get("sections", []):
                same_source = sec.get("source") == source
                has_overlap = set(sec.get("pages", [])) & new_pages_set
                if not (same_source and has_overlap):
                    filtered_sections.append(sec)
                    
            # Add the new batch sections
            filtered_sections.extend(batch_result.get("sections", []))
            
            # Sort sections by source order first, then by first page number
            def get_sec_sort_key(s):
                source_order = {"owner-manual": 0, "quick-start-guide": 1, "selection-chart": 2}
                source_val = source_order.get(s.get("source", "owner-manual"), 99)
                pages = s.get("pages", [])
                page_val = pages[0] if pages else 9999
                return (source_val, page_val)
                
            filtered_sections.sort(key=get_sec_sort_key)
            
            existing_data["sections"] = filtered_sections
            
            # Save updated raw index with clean formatting
            with open(output_file, "w", encoding="utf-8") as out_f:
                json.dump(existing_data, out_f, indent=2)
                
            print(f"Successfully updated raw index in {output_file}")
            
        except Exception as e:
            print(f"Error processing batch {batch_page_nums}: {e}")

if __name__ == "__main__":
    import argparse
    
    # Resolve directories relative to this script's path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(script_dir)
    default_output_file = os.path.join(root_dir, "public", "extracted", "raw_manual_index.json")

    parser = argparse.ArgumentParser(description="Generate manual index batches using OpenAI Vision API.")
    parser.add_argument("--source", default="owner-manual", choices=["owner-manual", "quick-start-guide", "selection-chart"], help="Manual source identifier")
    parser.add_argument("--pdf-dir", default=None, help="Directory containing page PDF files (defaults based on --source)")
    parser.add_argument("--output-file", default=default_output_file, help="Path to save the combined raw JSON index")
    parser.add_argument("--start", type=int, default=1, help="Start page number")
    parser.add_argument("--end", type=int, default=5, help="End page number (for testing)")
    parser.add_argument("--batch-size", type=int, default=5, help="Number of pages per batch")
    
    args = parser.parse_args()
    
    if args.pdf_dir is None:
        args.pdf_dir = os.path.join(root_dir, "public", "extracted", "pdf", args.source)
    
    run_batch_indexing(
        pdf_dir=args.pdf_dir,
        output_file=args.output_file,
        start_page=args.start,
        end_page=args.end,
        batch_size=args.batch_size,
        source=args.source
    )

