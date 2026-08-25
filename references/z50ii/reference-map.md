# Nikon Z50II reference evidence map

Last reviewed: 2026-08-25 (Asia/Shanghai).  This map is a modelling reference,
not Nikon manufacturing data or a repair instruction.  The source links below
are official Nikon properties; their externally visible information is used as
the dimensional and control-layout baseline.

## Source register

| ID | Official source URL | Scope used | Access result |
| --- | --- | --- | --- |
| NIKON-PRODUCT | https://www.nikonusa.com/p/z50ii/1784/overview | Published dimensions, sensor, mount, battery, storage, monitor and visible product information | Accessible 2026-08-25 |
| NIKON-MANUAL | https://downloadcenter.nikonimglib.com/en/products/637/Z50II.html | Nikon Download Center entry point for the Reference Guide (web/PDF) and user manual | Accessible 2026-08-25 |
| NIKON-REFERENCE-GUIDE | https://onlinemanual.nikonimglib.com/z50II/en/ | Camera-body control index, monitor, battery/card insertion and connection sections | Accessible 2026-08-25 |
| NIKON-SSR | https://ssr.downloadcenter.nikonimglib.com/en_US/products/39/Z50II.html | Nikon Self Service Repair product entry; identifies the repair manual | Accessible 2026-08-25 |
| NIKON-SSR-AGREEMENT | https://ssr.downloadcenter.nikonimglib.com/en_US/download/manual/39.html | Agreement-gated repair-manual download page for `Z50II_RM_(En)03.pdf` | Agreement page accessible; no download made |

## Feature-to-source map

| Feature | Source URL | Observed value | Model use | Confidence |
| --- | --- | --- | --- | --- |
| Body envelope | https://www.nikonusa.com/p/z50ii/1784/overview | 127 × 96.8 × 66.5 mm (W × H × D; Nikon lists as approximate) | Master exterior envelope and camera-scale anchor | high — published specification |
| Sensor active area | https://www.nikonusa.com/p/z50ii/1784/overview | 23.5 × 15.7 mm DX-format sensor (Nikon’s page presents 15.7 × 23.5 mm) | Sensor-cover/sensor module planar scale | high — published specification |
| Rear monitor | https://www.nikonusa.com/p/z50ii/1784/overview | 3.2-inch diagonal, vari-angle TFT touch-sensitive LCD | Rear-LCD housing, panel and hinge envelope | high — published specification |
| Lens interface | https://www.nikonusa.com/p/z50ii/1784/overview | Nikon Z mount | Front mount ring, bayonet and future lens attachment origin | high — published specification |
| Battery | https://www.nikonusa.com/p/z50ii/1784/overview | One EN-EL25a rechargeable Li-ion battery | Battery-bay placeholder and power module reference | high — published specification |
| Storage | https://www.nikonusa.com/p/z50ii/1784/overview | One SD/SDHC/SDXC slot, UHS-II compliant | SD-door, slot and storage-board placeholder | high — published specification |
| Front control placement | https://onlinemanual.nikonimglib.com/z50II/en/ | Nikon “Parts of the camera” / “Camera body” control-index material | Place grip-side front controls and mount-adjacent visible features; exact profiles are reference reconstruction | medium — official control index; geometry is reference reconstruction |
| Rear control placement | https://onlinemanual.nikonimglib.com/z50II/en/ | Nikon “Parts of the camera” / “Camera body” and “The monitor” material | Place rear buttons, EVF and vari-angle-monitor hardware; exact profiles are reference reconstruction | medium — official control index; geometry is reference reconstruction |
| Top control placement | https://onlinemanual.nikonimglib.com/z50II/en/ | Nikon “Parts of the camera” / “Camera body” material; product page confirms built-in flash and ISO 518 hot shoe | Place shutter area, top dials, hot shoe and flash envelope; fine geometry is reference reconstruction | medium — official control index; geometry is reference reconstruction |
| Side control placement | https://onlinemanual.nikonimglib.com/z50II/en/ | Nikon “Parts of the camera” / “Camera body” and connection sections | Place I/O-door region and side openings; exact door seams are reference reconstruction | medium — official control index; geometry is reference reconstruction |
| Ports | https://onlinemanual.nikonimglib.com/z50II/en/ | Reference Guide has USB streaming, HDMI connection and external-microphone connection sections; Nikon product page identifies UVC/UAC USB and headphone/remote use | Reserve USB, HDMI, microphone and headphone/remote external interfaces on the side I/O module; opening dimensions are reference reconstruction | medium — official connection functions; geometry is reference reconstruction |
| Shell-removal order | https://ssr.downloadcenter.nikonimglib.com/en_US/download/manual/39.html | Not observed: `Z50II_RM_(En)03.pdf` is agreement-gated and was not downloaded because the required interactive consent could not be completed with the available tools | Do not claim a Nikon-authoritative sequence. Use a dependency-safe reference reconstruction pending an approved manual download | unavailable — agreement-gated evidence not obtained |
| Main-board location | https://ssr.downloadcenter.nikonimglib.com/en_US/download/manual/39.html | Not observed: agreement-gated repair manual not downloaded | Main-board location is reference reconstruction only; mark `isReferenceGeometry: true` | unavailable — agreement-gated evidence not obtained |
| Sensor/shutter order | https://ssr.downloadcenter.nikonimglib.com/en_US/download/manual/39.html | Nikon product page confirms a vertical-travel focal-plane mechanical shutter, but internal stack order was not observed in the agreement-gated manual | Model sensor/shutter stack as reference reconstruction; no Nikon-authoritative removal order may be asserted | low — product function published; internal order is reference reconstruction |

## Repair-manual limitation

Nikon’s Self Service Repair page identifies the 128.86 MB English repair manual
`Z50II_RM_(En)03.pdf` and directs the user to an agreement page. That agreement
states that downloading begins only after selecting **I Consent**. The available
research tools could inspect the official page but could not complete that
interactive consent flow. To avoid bypassing the agreement, this task did not
download the PDF; therefore `references/vendor/Z50II-repair-manual.pdf` does not
exist and there is no download date or SHA-256 value to record.

Until a user-authorized, agreement-compliant local download is available, the
shell-removal order, main-board location, and sensor/shutter removal ordering
must remain explicitly labelled **reference reconstruction**. No derived
geometry should be represented as Nikon manufacturer CAD or repair-authoritative
data.
