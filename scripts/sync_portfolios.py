import json
import os
import re
import unicodedata
from pathlib import Path

def slugify(value):
    """Normalizes string, converts to lowercase, removes non-alphanumeric characters, and converts spaces to hyphens."""
    value = unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^\w\s-]', '', value.lower())
    slug = re.sub(r'[-\s]+', '-', value).strip('-')
    return slug[:100] # Truncate to avoid path length issues

def sync():
    processed_dir = Path("scripts/portfolio_aggregator/data/processed")
    output_dir = Path("data/portfolios")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    master_index = {}
    total_schemes = 0
    
    print(f"Syncing portfolios from {processed_dir} to {output_dir}...")
    
    for json_file in processed_dir.glob("*.json"):
        amc_id = json_file.name.split('_')[0]
        
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                schemes = json.load(f)
                
            if not isinstance(schemes, list): continue
            
            for scheme in schemes:
                name = scheme.get("scheme_name")
                if not name: continue
                
                slug = slugify(name)
                # Add AMC prefix to avoid name collisions across AMCs (rare but possible)
                unique_slug = f"{amc_id}-{slug}"
                
                # Save individual scheme file
                with open(output_dir / f"{unique_slug}.json", 'w', encoding='utf-8') as sf:
                    json.dump(scheme, sf, indent=4)
                
                # Add to index
                if amc_id not in master_index:
                    master_index[amc_id] = {}
                
                master_index[amc_id][name] = unique_slug
                total_schemes += 1
                
        except Exception as e:
            print(f"Error processing {json_file.name}: {e}")
            
    # Save master index
    with open(output_dir / "index.json", 'w', encoding='utf-8') as f:
        json.dump(master_index, f, indent=4)
        
    print(f"Sync complete! Indexed {total_schemes} schemes across {len(master_index)} AMCs.")

if __name__ == "__main__":
    sync()
