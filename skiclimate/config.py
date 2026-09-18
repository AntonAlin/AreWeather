"""Alla siffror man kan bråka om, samlade på ett ställe.

Koordinater, stationssök, parameter-id:n hos SMHI, tröskelvärden för
säsongsmått och vilka klimatmodeller vi hämtar. Ändra här, inte i koden.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

# ---------------------------------------------------------------------------
# Orter
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Resort:
    key: str
    name: str
    lat: float
    lon: float
    #: byn / liftbotten, meter över havet
    base_elevation: int
    #: högsta liftburna punkt, meter över havet
    top_elevation: int
    #: hur långt bort vi letar SMHI-stationer (km)
    station_radius_km: float = 60.0
    #: stationsnamn (delsträng, skiftlägesokänslig) som ska prioriteras om de finns
    preferred_stations: tuple[str, ...] = ()


RESORTS: dict[str, Resort] = {
    "salen": Resort(
        key="salen",
        name="Sälen",
        lat=61.1600,
        lon=13.2620,
        base_elevation=420,
        top_elevation=890,
        preferred_stations=("Sälen", "Idre", "Malung", "Särna", "Storbron", "Höljes"),
    ),
    "are": Resort(
        key="are",
        name="Åre",
        lat=63.3990,
        lon=13.0810,
        base_elevation=380,
        top_elevation=1420,
        preferred_stations=("Åre", "Storlien", "Sylarna", "Duved", "Järpen", "Hallen", "Enafors"),
    ),
    "tarnaby": Resort(
        key="tarnaby",
        name="Tärnaby",
        lat=65.7180,
        lon=15.3120,
        base_elevation=470,
        top_elevation=1000,
        preferred_stations=("Tärnaby", "Hemavan", "Storuman", "Klimpfjäll", "Gielas", "Stekenjokk"),
    ),
}


# ---------------------------------------------------------------------------
# SMHI:s öppna data (meteorologiska observationer)
# ---------------------------------------------------------------------------

SMHI_BASE = "https://opendata-download-metobs.smhi.se/api/version/1.0"

#: parameter-id -> (kolumnnamn hos oss, enhet vi vill ha, skalfaktor från SMHI:s enhet)
#: Dygnsparametrar först; de är vad säsongsanalysen faktiskt behöver.
SMHI_DAILY_PARAMETERS: dict[int, tuple[str, str, float]] = {
    2: ("t_mean", "°C", 1.0),      # Lufttemperatur, medel 1 dygn
    19: ("t_min", "°C", 1.0),      # Lufttemperatur, min per dygn
    20: ("t_max", "°C", 1.0),      # Lufttemperatur, max per dygn
    5: ("precip", "mm", 1.0),      # Nederbördsmängd, summa 1 dygn (kl 06)
    8: ("snow_depth", "cm", 100.0),  # Snödjup kl 06 – SMHI ger meter, vi vill ha cm
}

#: Timparametrar. Stora filer, behövs bara om man vill räkna våt temperatur
#: för snökanoner på riktigt. Avstängda som standard.
SMHI_HOURLY_PARAMETERS: dict[int, tuple[str, str, float]] = {
    1: ("t_hour", "°C", 1.0),      # Lufttemperatur, momentan, varje timme
    6: ("rh_hour", "%", 1.0),      # Relativ luftfuktighet
    4: ("wind_hour", "m/s", 1.0),  # Vindhastighet, 10-min medel
}

#: SMHI:s kvalitetskoder. G = granskad, Y = ogranskad/misstänkt, R = ...tveksam.
#: Vi behåller G och Y, kastar allt annat. Y är oftast bara "inte hunnit granska".
SMHI_KEEP_QUALITY = ("G", "Y")


# ---------------------------------------------------------------------------
# Open-Meteo: ERA5-reanalys (1940-) och CMIP6-projektioner (1950-2050)
# ---------------------------------------------------------------------------

OPENMETEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
OPENMETEO_CLIMATE = "https://climate-api.open-meteo.com/v1/climate"

ERA5_START = "1940-01-01"

ERA5_DAILY_VARIABLES = (
    "temperature_2m_mean",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "rain_sum",
    "snowfall_sum",
    "wind_speed_10m_max",
    "shortwave_radiation_sum",
)

#: snödjup finns bara per timme i arkivet. Hämtas år för år och pressas till dygn.
ERA5_HOURLY_SNOW_VARIABLE = "snow_depth"

#: Samma sju HighResMIP-modeller som webbsidans "warming"-vy. Enda scenariot
#: Open-Meteo tillhandahåller är SSP5-8.5, vilket är det pessimistiska. Säg det
#: högt varje gång siffrorna presenteras.
CMIP6_MODELS = (
    "EC_Earth3P_HR",
    "MRI_AGCM3_2_S",
    "HiRAM_SIT_HR",
    "CMCC_CM2_VHR4",
    "FGOALS_f3_H",
    "NICAM16_8S",
    "MPI_ESM1_2_XR",
)
CMIP6_START = "1950-01-01"
CMIP6_END = "2050-12-31"
CMIP6_DAILY_VARIABLES = (
    "temperature_2m_mean",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "snowfall_sum",
)

#: NASA GISTEMP, global medeltemperaturanomali. Används för att koppla lokal
#: vintertemperatur till global uppvärmning. Frivillig – pipelinen klarar sig utan.
GISTEMP_URL = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv"


# ---------------------------------------------------------------------------
# Säsongsdefinitioner
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SeasonRules:
    #: en vinter börjar i juli så att ingen vinter delas på två kalenderår
    year_start_month: int = 7
    #: "kärnvinter" – när en tödag faktiskt gör skada
    core_winter: tuple[int, int] = (12, 3)
    #: perioden snökanonerna får köra
    making_season: tuple[int, int] = (11, 3)
    #: dygnsmin under detta ≈ våt temperatur under -2 °C i fjällen (grov proxy)
    snowmaking_tmin: float = -4.0
    #: dygnsmax över detta mitt i vintern räknas som tö
    thaw_above: float = 2.0
    #: klassiska 100-dagarsregeln: minst så här djupt, minst så här många dagar
    reliable_depth_cm: float = 30.0
    reliable_days: int = 100
    #: snötäcke över huvud taget
    cover_depth_cm: float = 1.0
    #: så många dygn i rad under noll öppnar/stänger "termisk vinter"
    run_length: int = 5
    #: graddagsmodell: smältning per plusgrad och dygn (mm vattenekvivalent)
    melt_factor: float = 3.5
    #: densitet i satt snötäcke (kg/m³), för att göra mm vatten till cm snö
    pack_density: float = 300.0
    #: nederbörd faller som snö när dygnsmedlet är under detta
    snow_temp_threshold: float = 1.0
    #: temperaturavtagande med höjd, °C per 100 m
    lapse_rate: float = 0.65


SEASON = SeasonRules()

#: WMO-normalperioderna vi jämför
PERIODS = {
    "past": (1961, 1990),
    "present": (1991, 2020),
    "future": (2031, 2050),
}


# ---------------------------------------------------------------------------
# Kataloger
# ---------------------------------------------------------------------------


@dataclass
class Paths:
    root: Path = field(default_factory=lambda: Path("data"))

    @property
    def raw(self) -> Path:
        return self.root / "raw"

    @property
    def processed(self) -> Path:
        return self.root / "processed"

    @property
    def output(self) -> Path:
        return self.root / "output"

    def ensure(self) -> "Paths":
        for p in (self.raw, self.processed, self.output):
            p.mkdir(parents=True, exist_ok=True)
        return self


# ---------------------------------------------------------------------------
# Färger för diagrammen. Tre orter = tre första platserna i en CVD-validerad
# palett (blå, orange, aqua). Lägg inte till en fjärde ort utan att validera.
# ---------------------------------------------------------------------------
RESORT_COLORS = {
    "salen": "#2a78d6",
    "are": "#eb6834",
    "tarnaby": "#1baf7a",
}
