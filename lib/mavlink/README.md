# MAVLink v2 headers (vendored)

SROT talks the **standard MAVLink v2 `ardupilotmega` dialect** (which includes
`common`) so QGroundControl and BlueOS treat the board as a real Sub vehicle —
while the *name/version* it reports is **SROT** (see `AUTOPILOT_VERSION` +
boot `STATUSTEXT` in `Task_MAVLink`, Phase 2).

These are **generated header-only** files — nothing to compile, just include.
They are intentionally **not** pulled from the PlatformIO registry; vendor them
here so the dialect and version are pinned to the firmware.

## How to vendor (run once, from the project root)

```sh
# Shallow-clone the official pre-generated C library:
git clone --depth 1 https://github.com/mavlink/c_library_v2.git /tmp/c_library_v2

# Copy the generated headers into this folder:
#   lib/mavlink/            <- common headers + protocol.h, mavlink_types.h, checksum.h ...
#   lib/mavlink/common/
#   lib/mavlink/ardupilotmega/
cp -r /tmp/c_library_v2/* lib/mavlink/
```

On Windows PowerShell:

```powershell
git clone --depth 1 https://github.com/mavlink/c_library_v2.git $env:TEMP\c_library_v2
Copy-Item -Recurse -Force $env:TEMP\c_library_v2\* .\lib\mavlink\
```

After vendoring, the top-level `mavlink.h` selects the dialect. `Task_MAVLink`
(Phase 2) will `#include "ardupilotmega/mavlink.h"`.

## Build wiring (already in `platformio.ini`)

```
build_flags =
    -I lib/mavlink
    -I lib/mavlink/ardupilotmega
    -D MAVLINK_COMM_NUM_BUFFERS=2
```

Until the headers are vendored these include paths simply resolve to nothing
(the compiler ignores missing `-I` dirs) and the Phase-0 stub build is
unaffected, because no source `#include`s a MAVLink header yet.

## Version pin

Record the `c_library_v2` commit hash you vendored here once done:

- vendored commit: `ee5827fcb834bf9e149dc2317fd444e4d1ef9d2e` (2026, mavlink/c_library_v2)
- dialect: `ardupilotmega` (supersets `common`)
- MAVLink wire protocol: v2
