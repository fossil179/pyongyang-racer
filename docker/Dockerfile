# Pyongyang Racer — real Flash Player streamed with video, audio and input.
# Selkies uses WebSockets/WebCodecs and PulseAudio/Opus in the browser.
# Ubuntu 20.04: Flash Player SA needs older libs not present on 22.04.
FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    SCREEN_WIDTH=760 \
    SCREEN_HEIGHT=500 \
    XDG_RUNTIME_DIR=/tmp/runtime-racer \
    PULSE_RUNTIME_PATH=/tmp/runtime-racer/pulse \
    PULSE_SERVER=unix:/tmp/runtime-racer/pulse/native \
    PULSE_SINK=output \
    SDL_AUDIODRIVER=pulse

# Ubuntu 20.04's stock GBM predates gbm_bo_create_with_modifiers2, which the
# current Selkies pixelflux wheel requires. Kisak's stable Focal Mesa packages
# provide the newer ABI while retaining Ubuntu 20.04 compatibility for Flash.
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    && add-apt-repository -y ppa:kisak/turtle \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    xvfb xdotool x11-utils x11-xkb-utils x11-xserver-utils \
    wget ca-certificates supervisor \
    pulseaudio pulseaudio-utils libpulse0 libasound2-plugins \
    libgbm1 libva2 libva-drm2 libva-x11-2 \
    libx11-xcb1 libxcb1 libxcb-shm0 libxcb-xfixes0 libxcb-randr0 \
    libxdamage1 libxfixes3 libxext6 libxtst6 \
    libgtk2.0-0 libnss3 libxss1 libasound2 libdbus-glib-1-2 \
    libglu1-mesa libxi6 libxrender1 libxtst6 libfreetype6 \
    libxcursor1 libxrandr2 libcurl4 libgconf-2-4 libpango1.0-0 \
    libfontconfig1 libatk1.0-0 libgdk-pixbuf2.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# The pinned Selkies 2 runtime includes its HTML5 client, H.264 encoder and
# PulseAudio-to-Opus audio capture. Extract the AppImage at build time so the
# container does not need FUSE or elevated privileges at runtime.
ARG SELKIES_VERSION=2.0.0rc0
RUN mkdir -p /opt/selkies \
    && wget -qO /opt/selkies/selkies.AppImage \
      "https://github.com/selkies-project/selkies/releases/download/v${SELKIES_VERSION}/selkies-${SELKIES_VERSION}-x86_64.AppImage" \
    && chmod +x /opt/selkies/selkies.AppImage \
    && cd /opt/selkies \
    && ./selkies.AppImage --appimage-extract >/dev/null \
    && mv squashfs-root app \
    && rm selkies.AppImage

# Adobe Flash Player standalone (Linux x86_64) — same binary family as Mac SA player
RUN mkdir -p /opt/flash \
    && wget -qO /tmp/flash.tar.gz \
      "https://github.com/Grubsic/Adobe-Flash-Player-Debug-Downloads-Archive/raw/main/Linux/flash_player_sa_linux.x86_64.tar.gz" \
    && tar xzf /tmp/flash.tar.gz -C /opt/flash \
    && chmod +x /opt/flash/flashplayer \
    && rm /tmp/flash.tar.gz

# Game files — identical layout to Pyongyang Racer.app Resources/game/
COPY ["PY Racer_0509", "/game/PY Racer_0509"]
COPY 1.dat common.dat sound.dat symbol.dat common.txt info.txt PreGame.mp3 /game/
COPY photo /game/photo

COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/start-pulseaudio.sh /docker/start-pulseaudio.sh
COPY docker/start-selkies.sh /docker/start-selkies.sh
COPY docker/start-flash.sh /docker/start-flash.sh
COPY docker/supervisord.conf /etc/supervisor/conf.d/pyongyang.conf
RUN useradd --create-home --uid 1000 --shell /bin/bash racer \
    && chown -R racer:racer /opt/selkies /game \
    && chmod +x /entrypoint.sh /docker/start-pulseaudio.sh \
      /docker/start-selkies.sh /docker/start-flash.sh

EXPOSE 6080

USER racer
ENTRYPOINT ["/entrypoint.sh"]
