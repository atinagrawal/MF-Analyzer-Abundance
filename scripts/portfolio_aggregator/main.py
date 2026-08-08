import json
import os
import argparse
import logging
from datetime import datetime
from fetchers.sbi_fetcher import SBIFetcher
from fetchers.hdfc_fetcher import HDFCFetcher
from fetchers.quant_fetcher import QuantFetcher
from fetchers.bandhan_fetcher import BandhanFetcher
from fetchers.ppfas_fetcher import PPFASFetcher
from fetchers.kotak_fetcher import KotakFetcher
from fetchers.nippon_fetcher import NipponFetcher
from fetchers.icici_fetcher import ICICIFetcher
from fetchers.absl_fetcher import ABSLFetcher
from fetchers.tata_fetcher import TataFetcher
from fetchers.motilal_fetcher import MotilalFetcher
from fetchers.axis_fetcher import AxisFetcher
from fetchers.uti_fetcher import UTIFetcher
from fetchers.franklin_fetcher import FranklinFetcher
from fetchers.invesco_fetcher import InvescoFetcher
from fetchers.edelweiss_fetcher import EdelweissFetcher
from fetchers.lic_fetcher import LICFetcher
from fetchers.mirae_fetcher import MiraeFetcher
from fetchers.hsbc_fetcher import HSBCFetcher
from fetchers.dsp_fetcher import DSPFetcher
from fetchers.canara_fetcher import CanaraRobecoFetcher
from fetchers.sundaram_fetcher import SundaramFetcher
from fetchers.mahindra_fetcher import MahindraFetcher
from fetchers.navi_fetcher import NaviFetcher
from fetchers.groww_fetcher import GrowwFetcher
from parsers.portfolio_parser import PortfolioParser

# Configure logging
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, f"aggregator_{datetime.now().strftime('%Y%m%d')}.log")),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("AggregatorMain")

STRATEGY_MAP = {
    "api_post": SBIFetcher,
    "nextjs_state": HDFCFetcher,
    "browser_automation": QuantFetcher,
    "bandhan_api": BandhanFetcher,
    "kotak_api": KotakFetcher,
    "static_html": PPFASFetcher,
    "nippon_api": NipponFetcher,
    "icici_api": ICICIFetcher,
    "absl_api": ABSLFetcher,
    "tata_api": TataFetcher,
    "motilal_api": MotilalFetcher,
    "axis_api": AxisFetcher,
    "uti_api": UTIFetcher,
    "franklin_api": FranklinFetcher,
    "invesco_api": InvescoFetcher,
    "edelweiss_api": EdelweissFetcher,
    "lic_api": LICFetcher,
    "mirae_api": MiraeFetcher,
    "hsbc_api": HSBCFetcher,
    "dsp_api": DSPFetcher,
    "canara_api": CanaraRobecoFetcher,
    "sundaram_api": SundaramFetcher,
    "mahindra_api": MahindraFetcher,
    "navi_api": NaviFetcher,
    "groww_api": GrowwFetcher
}

class Aggregator:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        self.raw_dir = os.path.join(data_dir, "raw")
        self.processed_dir = os.path.join(data_dir, "processed")
        os.makedirs(self.raw_dir, exist_ok=True)
        os.makedirs(self.processed_dir, exist_ok=True)
        self.parser = PortfolioParser()
        self.manifest_path = os.path.join(data_dir, "manifest.json")

    def run(self, year, month, amc_id=None):
        logger.info(f"Starting aggregation for {month} {year}")
        
        registry_path = os.path.join(os.path.dirname(__file__), "amc_registry.json")
        with open(registry_path, "r") as f:
            registry = json.load(f)
            
        if amc_id:
            registry = [amc for amc in registry if amc['id'] == amc_id]
            
        summary = {
            "timestamp": datetime.now().isoformat(),
            "period": f"{month}_{year}",
            "results": []
        }

        for amc in registry:
            amc_result = {"amc": amc['name'], "status": "failed", "schemes_parsed": 0}
            try:
                logger.info(f"Processing {amc['name']}...")
                strategy_class = STRATEGY_MAP.get(amc['strategy'])
                if not strategy_class:
                    logger.warning(f"No implementation for strategy: {amc['strategy']}")
                    amc_result["status"] = "not_implemented"
                    continue
                    
                fetcher = strategy_class(amc['name'], amc['url'])
                links = fetcher.get_portfolio_links(year, month)
                
                if not links:
                    logger.warning(f"No links found for {amc['name']}")
                    amc_result["status"] = "no_links"
                    continue
                    
                # Download and parse top 5 (or all if small)
                # Usually master portfolio is first or contains everything
                for link in links[:5]:
                    file_ext = ".zip" if ".zip" in link['url'].lower() else ".xlsx"
                    file_name = f"{amc['id']}_{month}_{year}_{link['title'][:50]}{file_ext}"
                    file_name = "".join([c if c.isalnum() or c in "._-" else "_" for c in file_name])
                    raw_path = os.path.join(self.raw_dir, file_name)
                    
                    if fetcher.download_file(link['url'], raw_path):
                        files_to_parse = [raw_path]
                        
                        # Handle ZIP extraction
                        if raw_path.endswith(".zip"):
                            import zipfile
                            extract_dir = raw_path.replace(".zip", "_extracted")
                            os.makedirs(extract_dir, exist_ok=True)
                            with zipfile.ZipFile(raw_path, 'r') as zip_ref:
                                zip_ref.extractall(extract_dir)
                            
                            files_to_parse = []
                            for root, _, files in os.walk(extract_dir):
                                for f in files:
                                    if f.endswith(('.xlsx', '.xls')):
                                        files_to_parse.append(os.path.join(root, f))
                        
                        all_data = []
                        for f_path in files_to_parse:
                            try:
                                data = self.parser.parse_excel(f_path)
                                if data:
                                    all_data.extend(data)
                            except Exception as parse_e:
                                logger.warning(f"Failed to parse {f_path}: {parse_e}")
                        
                        if all_data:
                            processed_name = file_name.split(".")[0] + ".json"
                            processed_path = os.path.join(self.processed_dir, processed_name)
                            with open(processed_path, "w") as f:
                                json.dump(all_data, f, indent=4)
                            amc_result["status"] = "success"
                            amc_result["schemes_parsed"] += len(all_data)
                            logger.info(f"Successfully parsed {len(all_data)} schemes from {file_name}")
                
            except Exception as e:
                logger.error(f"Error processing {amc['name']}: {e}")
                amc_result["error"] = str(e)
                
            summary["results"].append(amc_result)

        self._save_manifest(summary)
        logger.info("Aggregation complete.")

    def _save_manifest(self, summary):
        try:
            with open(self.manifest_path, "w") as f:
                json.dump(summary, f, indent=4)
        except Exception as e:
            logger.error(f"Could not save manifest: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=datetime.now().year)
    parser.add_argument("--month", type=str, default=datetime.now().strftime("%B"))
    parser.add_argument("--amc", type=str, help="AMC ID")
    args = parser.parse_args()
    
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    agg = Aggregator(data_dir)
    agg.run(args.year, args.month, args.amc)
