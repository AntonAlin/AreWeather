"""skiclimate – väderhistorik och säsongsanalys för Sälen, Åre och Tärnaby.

Pipeline i tre steg:

    download  ->  SMHI-stationer + ERA5 (Open-Meteo) + CMIP6 (Open-Meteo climate)
    features  ->  en rad per ort och vinter (säsongslängd, tödagar, frostnätter ...)
    analyze   ->  trender, brytpunkter, känslighet mot global temperatur, ML-projektion

Allt körs från ``run_pipeline.py`` eller från en notebook (Colab / Fabric).
"""

__version__ = "0.1.0"
