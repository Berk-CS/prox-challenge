import os
import json
import glob
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)

INPUT_FILE = os.path.join(ROOT_DIR, "public", "extracted", "raw_manual_index.json")
OUTPUT_FILE = os.path.join(ROOT_DIR, "public", "extracted", "manual_index.json")

def post_process_batches():
    print("Starting post-processing pipeline...")
    
    if not os.path.exists(INPUT_FILE):
        print(f"Error: Input file {INPUT_FILE} does not exist. Run the generator first.")
        return
        
    print(f"Reading raw index from {INPUT_FILE}...")
    try:
        with open(INPUT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading or parsing {INPUT_FILE}: {e}")
        return
        
    sections = data.get("sections", [])
    if not sections:
        print("No sections found in raw index.")
        return
        
    print(f"Processing {len(sections)} sections...")
    merged_sections = []
    last_sec_by_source = {}
    
    for sec in sections:
        title = sec.get("title", "").strip()
        pages = sec.get("pages", [])
        visuals = sec.get("visuals", [])
        source = sec.get("source", "owner-manual")
        
        # Check if it is a continuation
        if title.upper() == "CONTINUATION":
            if source in last_sec_by_source:
                # Append to preceding section of the same source
                prev_sec = last_sec_by_source[source]
                
                # Add page numbers (avoid duplicates and sort)
                current_pages = set(prev_sec.get("pages", []))
                current_pages.update(pages)
                prev_sec["pages"] = sorted(list(current_pages))
                
                # Add visuals
                if "visuals" not in prev_sec:
                    prev_sec["visuals"] = []
                prev_sec["visuals"].extend(visuals)
                
                print(f"  Appended continuation pages {pages} to source '{source}' section '{prev_sec['title']}'")
            else:
                # No preceding section exists for this source, add it as-is for now
                print(f"  Warning: Found 'CONTINUATION' section at the beginning for source '{source}'. Adding as new section.")
                new_sec = {
                    "title": title,
                    "pages": sorted(list(set(pages))),
                    "visuals": visuals,
                    "source": source
                }
                merged_sections.append(new_sec)
                last_sec_by_source[source] = new_sec
        else:
            # Clean/normalize section structure
            new_sec = {
                "title": title,
                "pages": sorted(list(set(pages))),
                "visuals": visuals,
                "source": source
            }
            merged_sections.append(new_sec)
            last_sec_by_source[source] = new_sec
            print(f"  Added new section '{title}' for source '{source}' with pages {pages}")
            
    # Save final human-readable manual_index.json
    final_output = {"sections": merged_sections}
    try:
        # Create output dir if needed
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, "w", encoding="utf-8") as out_f:
            json.dump(final_output, out_f, indent=2)
        print(f"\nSuccessfully combined index and saved to {OUTPUT_FILE}")
    except Exception as e:
        print(f"Error saving final output file: {e}")

    # Generate compact, token-efficient index for the LLM
    compact_data = {
        "om": [],
        "qsg": [],
        "sc": []
    }
    
    source_map = {
        "owner-manual": "om",
        "quick-start-guide": "qsg",
        "selection-chart": "sc"
    }
    
    for sec in merged_sections:
        source = sec.get("source", "owner-manual")
        short_src = source_map.get(source, "om")
        
        compact_sec = {
            "t": sec["title"],
            "p": sec["pages"]
        }
        
        # Only include visuals if they exist to save tokens
        visuals = sec.get("visuals", [])
        if visuals:
            compact_visuals = []
            for vis in visuals:
                compact_visuals.append({
                    "p": vis["page"],
                    "d": vis["description"]
                })
            compact_sec["v"] = compact_visuals
            
        compact_data[short_src].append(compact_sec)
        
    # Save compact index (minified with no whitespace and no empty lists)
    COMPACT_FILE = os.path.join(ROOT_DIR, "public", "extracted", "manual_index_compact.json")
    try:
        with open(COMPACT_FILE, "w", encoding="utf-8") as out_f:
            json.dump(compact_data, out_f, separators=(',', ':'))
        print(f"Successfully saved compact index to {COMPACT_FILE}")
    except Exception as e:
        print(f"Error saving compact output file: {e}")

    # Generate CSV version for the LLM
    import csv
    CSV_FILE = os.path.join(ROOT_DIR, "public", "extracted", "manual_index.csv")
    try:
        with open(CSV_FILE, "w", encoding="utf-8", newline="") as csv_f:
            writer = csv.writer(csv_f, lineterminator="\n")
            # Header row
            writer.writerow(["source", "title", "pages", "visual_page", "visual_description"])
            
            for sec in merged_sections:
                source = sec.get("source", "owner-manual")
                short_src = source_map.get(source, "om")
                title = sec["title"]
                pages_str = ";".join(map(str, sec["pages"]))
                
                visuals = sec.get("visuals", [])
                if visuals:
                    for vis in visuals:
                        writer.writerow([
                            short_src,
                            title,
                            pages_str,
                            str(vis["page"]),
                            vis["description"]
                        ])
                else:
                    writer.writerow([
                        short_src,
                        title,
                        pages_str,
                        "",
                        ""
                    ])
        print(f"Successfully saved CSV index to {CSV_FILE}")
    except Exception as e:
        print(f"Error saving CSV output file: {e}")

if __name__ == "__main__":
    post_process_batches()
