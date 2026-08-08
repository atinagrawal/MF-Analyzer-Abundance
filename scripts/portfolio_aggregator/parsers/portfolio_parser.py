import pandas as pd
import logging
import re
import json
import os

logger = logging.getLogger("PortfolioParser")
logging.basicConfig(level=logging.INFO)

class PortfolioParser:
    def __init__(self):
        # Expanded patterns for better matching across AMCs
        self.column_mapping = {
            'isin': [r'isin', r'instrument.*code', r'code'],
            'security_name': [r'name.*of.*instrument', r'security.*name', r'issuer', r'instrument.*name', r'name'],
            'sector': [r'industry', r'sector', r'rating'],
            'quantity': [r'quantity', r'qty'],
            'market_value': [r'market.*value', r'value.*lakhs', r'valuation'],
            'weightage': [r'weightage', r'%.*to.*nav', r'%.*to.*aum', r'percentage.*of.*aum', r'%.*to.*net.*asset']
        }

    def parse_excel(self, file_path):
        """Parses an AMC Excel file and returns normalized data"""
        try:
            xl = pd.ExcelFile(file_path)
            all_holdings = []
            
            for sheet_name in xl.sheet_names:
                # Skip index/summary sheets
                if any(x in sheet_name.lower() for x in ['index', 'summary', 'contents', 'disclaimer', 'annexure']):
                    continue
                    
                try:
                    df = pd.read_excel(file_path, sheet_name=sheet_name)
                    
                    # Try to find a better scheme name from the sheet content
                    actual_scheme_name = self._extract_scheme_name(df, sheet_name)
                    
                    holdings = self._extract_holdings(df, actual_scheme_name)
                    if holdings:
                        all_holdings.append({
                            "scheme_name": actual_scheme_name,
                            "holdings": holdings
                        })
                except Exception as e:
                    logger.error(f"Error parsing sheet {sheet_name} in {file_path}: {e}")
                    
            return all_holdings
        except Exception as e:
            logger.error(f"Error opening Excel {file_path}: {e}")
            return None

    def _extract_scheme_name(self, df, default_name):
        """Tries to find the scheme name in the first few rows or columns of the sheet"""
        # 1. Check columns
        for col in df.columns:
            col_str = str(col)
            match = re.search(r'(?:Portfolio of|Portfolio for)\s+([^,]+?)(?:\s+as on|$)', col_str, re.I)
            if match:
                return match.group(1).strip()
            if len(col_str) > 20 and ("Fund" in col_str or "Portfolio" in col_str):
                return col_str.split("as on")[0].strip()

        # 2. Check rows
        for idx, row in df.head(10).iterrows():
            row_str = " ".join([str(x) for x in row if pd.notnull(x)])
            match = re.search(r'(?:Portfolio of|Portfolio for)\s+([^,]+?)(?:\s+as on|$)', row_str, re.I)
            if match:
                return match.group(1).strip()
            
            for val in row:
                val_str = str(val).strip()
                if len(val_str) > 20 and ("Fund" in val_str or "Portfolio" in val_str):
                    return val_str.split("as on")[0].strip()
                    
        return default_name

    def _extract_holdings(self, df, scheme_name):
        """Extracts holdings from a single dataframe with robust header detection and shift handling"""
        
        # 1. Detect header row by scanning first 30 rows
        header_row_idx = -1
        best_match_count = 0
        
        for idx, row in df.head(30).iterrows():
            row_str = " ".join([str(x).lower() for x in row if pd.notnull(x)])
            match_count = 0
            if "isin" in row_str: match_count += 2
            if "instrument" in row_str or "security" in row_str or "issuer" in row_str: match_count += 1
            if "market value" in row_str or "valuation" in row_str: match_count += 1
            if "aum" in row_str or "nav" in row_str or "% to" in row_str: match_count += 1
            
            if match_count > best_match_count:
                best_match_count = match_count
                header_row_idx = idx
                
        if best_match_count < 2:
            return None
            
        # 2. Map columns using detected header row
        header_row = df.iloc[header_row_idx]
        mapping = {}
        for col_key, patterns in self.column_mapping.items():
            for i, val in enumerate(header_row):
                val_str = re.sub(r'\s+', ' ', str(val).lower())
                if any(re.search(p, val_str) for p in patterns):
                    if col_key not in mapping:
                        mapping[col_key] = i
                        break
        
        # Critical columns check
        if 'isin' not in mapping and 'security_name' not in mapping:
            return None
            
        # 3. Extract data starting from row after header
        data = []
        for idx, row in df.iloc[header_row_idx+1:].iterrows():
            try:
                # Handle cases where ISIN column is shifted or uses 'nan' but has data in adjacent cells
                # But for ISIN, it's usually strict. 
                isin_idx = mapping.get('isin')
                if isin_idx is None: continue
                
                isin = str(row.iloc[isin_idx]).strip()
                
                # If ISIN is null, try adjacent columns if they look like ISINs
                if not re.match(r'^[A-Z]{2}[A-Z0-9]{10}$', isin):
                    for offset in [-1, 1]:
                        if 0 <= isin_idx + offset < len(row):
                            alt_isin = str(row.iloc[isin_idx + offset]).strip()
                            if re.match(r'^[A-Z]{2}[A-Z0-9]{10}$', alt_isin):
                                isin = alt_isin
                                break
                                
                if not re.match(r'^[A-Z]{2}[A-Z0-9]{10}$', isin):
                    continue
                    
                # Handle Security Name shift (common in merged cells)
                name_idx = mapping.get('security_name')
                security_name = str(row.iloc[name_idx]).strip() if name_idx is not None else ""
                
                if not security_name or security_name.lower() in ['nan', 'none', 'total']:
                    # Look ahead/behind for the first non-null string that isn't the ISIN
                    for i in range(len(row)):
                        val = str(row.iloc[i]).strip()
                        if val and val.lower() not in ['nan', 'none', 'total'] and val != isin:
                            # Avoid picking up numeric values for name
                            try:
                                float(val.replace(',', ''))
                                continue
                            except ValueError:
                                security_name = val
                                break
                
                if not security_name:
                    continue
                    
                holding = {
                    "isin": isin,
                    "security_name": security_name,
                    "sector": str(row.iloc[mapping['sector']]).strip() if 'sector' in mapping else "Unknown",
                    "quantity": self._to_float(row.iloc[mapping['quantity']]) if 'quantity' in mapping else 0.0,
                    "market_value": self._to_float(row.iloc[mapping['market_value']]) if 'market_value' in mapping else 0.0,
                    "weightage": self._to_float(row.iloc[mapping['weightage']]) if 'weightage' in mapping else 0.0
                }
                data.append(holding)
            except Exception:
                continue

        if data:
            # AMCs report "% to Net Assets" inconsistently: some as a percentage
            # (6.24 meaning 6.24%), others as a raw fraction (0.0624). A fund's
            # single largest holding is virtually never below 1.5% on a
            # percentage scale, so a sub-1.5 max is a reliable signal the
            # column is fraction-scaled and needs converting to percentage.
            max_weightage = max(h["weightage"] for h in data)
            if 0 < max_weightage < 1.5:
                for h in data:
                    h["weightage"] *= 100

        return data if len(data) > 0 else None

    def _to_float(self, val):
        if pd.isnull(val): return 0.0
        if isinstance(val, (int, float)): return float(val)
        try:
            # Handle strings with commas or percentage signs
            clean_val = str(val).replace(',', '').replace('%', '').strip()
            if not clean_val or clean_val.lower() == 'nan': return 0.0
            return float(clean_val)
        except (ValueError, TypeError):
            return 0.0
