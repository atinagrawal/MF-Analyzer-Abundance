import json
import os
import glob
from collections import defaultdict

class PortfolioConsolidator:
    def __init__(self, processed_dir):
        self.processed_dir = processed_dir

    def consolidate(self, output_path):
        """Consolidates all processed JSONs into a master analysis file"""
        files = glob.glob(os.path.join(self.processed_dir, "*.json"))
        
        master_data = {
            "last_updated": os.path.getmtime(files[0]) if files else 0,
            "total_amcs": 0,
            "total_schemes": 0,
            "amcs": {},
            "stock_concentration": defaultdict(lambda: {"total_weight": 0, "holding_schemes": []})
        }
        
        amc_ids = set()
        for file_path in files:
            # Skip manifest
            if "manifest.json" in file_path: continue
            
            with open(file_path, "r") as f:
                schemes_data = json.load(f)
                
            # Extract AMC ID from filename (e.g., sbi_mf_March_2026...)
            file_name = os.path.basename(file_path)
            amc_id = file_name.split("_")[0] + "_" + file_name.split("_")[1]
            amc_ids.add(amc_id)
            
            if amc_id not in master_data["amcs"]:
                master_data["amcs"][amc_id] = {"schemes": []}
                
            for scheme in schemes_data:
                master_data["total_schemes"] += 1
                scheme_entry = {
                    "name": scheme["scheme_name"],
                    "holdings_count": len(scheme["holdings"])
                }
                master_data["amcs"][amc_id]["schemes"].append(scheme_entry)
                
                # Aggregate stock concentration
                for holding in scheme["holdings"]:
                    isin = holding["isin"]
                    stock_name = holding["security_name"]
                    weight = holding["weightage"]
                    
                    master_data["stock_concentration"][isin]["name"] = stock_name
                    master_data["stock_concentration"][isin]["total_weight"] += weight
                    master_data["stock_concentration"][isin]["holding_schemes"].append({
                        "amc": amc_id,
                        "scheme": scheme["scheme_name"],
                        "weight": weight
                    })
        
        master_data["total_amcs"] = len(amc_ids)
        
        # Sort stocks by total weightage
        sorted_stocks = sorted(
            master_data["stock_concentration"].items(), 
            key=lambda x: x[1]["total_weight"], 
            reverse=True
        )
        
        master_data["top_stocks"] = sorted_stocks[:50]
        # Convert defaultdict to regular dict for JSON
        master_data["stock_concentration"] = dict(master_data["stock_concentration"])

        with open(output_path, "w") as f:
            json.dump(master_data, f, indent=4)
            
        print(f"Consolidation complete. Saved to {output_path}")

if __name__ == "__main__":
    processed_dir = r"d:\workspace\MF-Analyzer-Abundance\scripts\portfolio_aggregator\data\processed"
    output_path = r"d:\workspace\MF-Analyzer-Abundance\scripts\portfolio_aggregator\data\master_analysis.json"
    
    consolidator = PortfolioConsolidator(processed_dir)
    consolidator.consolidate(output_path)
