"""Service for satellite data management."""
import json
import os
from datetime import datetime
from typing import Optional, Dict, List
from .models import SatelliteData, SatellitePass

class SatelliteService:
    """Service for managing satellite data and finding next passes."""
    
    def __init__(self, satellites_file: str = "app/sdr/satellites.json"):
        self.satellites_file = satellites_file
        self._satellites_cache: Optional[Dict[str, SatelliteData]] = None
        self._passes_cache: List[SatellitePass] = []
    
    def load_satellites(self) -> Dict[str, SatelliteData]:
        """Load satellite data from JSON file."""
        if self._satellites_cache is not None:
            return self._satellites_cache
        
        try:
            with open(self.satellites_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            satellites = {}
            for sat_name, sat_data in data.get('satellites', {}).items():
                satellites[sat_name] = SatelliteData(**sat_data)
            
            self._satellites_cache = satellites
            return satellites
            
        except FileNotFoundError:
            print(f"Warning: Satellites file {self.satellites_file} not found")
            return {}
        except Exception as e:
            print(f"Error loading satellites: {e}")
            return {}
    
    def get_satellite(self, name: str) -> Optional[SatelliteData]:
        """Get satellite data by name."""
        satellites = self.load_satellites()
        return satellites.get(name)
    
    def get_all_satellites(self) -> Dict[str, SatelliteData]:
        """Get all satellite data."""
        return self.load_satellites()
    
    def set_passes(self, passes: List[SatellitePass]):
        """Set current passes list."""
        self._passes_cache = passes
    
    def get_next_pass(self) -> Optional[SatellitePass]:
        """Get the next upcoming satellite pass."""
        if not self._passes_cache:
            return None
        
        now = datetime.now()
        
        # Find next pass (AOS time in future)
        upcoming_passes = [
            pass_info for pass_info in self._passes_cache
            if pass_info.aos_time > now
        ]
        
        if not upcoming_passes:
            return None
        
        # Sort by AOS time and return the earliest
        upcoming_passes.sort(key=lambda p: p.aos_time)
        return upcoming_passes[0]
    
    def get_current_satellite_data(self) -> Optional[SatelliteData]:
        """Get satellite data for the next upcoming pass."""
        next_pass = self.get_next_pass()
        if not next_pass:
            return None
        
        return self.get_satellite(next_pass.satellite_name)
    
    def calculate_center_frequency(self, satellite_frequency: int) -> int:
        """Calculate center frequency (satellite + 60kHz offset)."""
        return satellite_frequency + 60000

# Global service instance
satellite_service = SatelliteService()