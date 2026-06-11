# Pyongyang Racer — real Flash Player via noVNC (linux/amd64 for Oracle/GCP x86 VMs)
# Ubuntu 20.04: Flash Player SA needs older libs not present on 22.04.
FROM --platform=linux/amd64 ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    SCREEN_WIDTH=800 \
    SCREEN_HEIGHT=600

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc xdotool x11-utils wget ca-certificates supervisor openssl \
    libgtk2.0-0 libnss3 libxss1 libasound2 libdbus-glib-1-2 \
    libglu1-mesa libxi6 libxrender1 libxtst6 libfreetype6 \
    libxcursor1 libxrandr2 libcurl4 libgconf-2-4 libpango1.0-0 \
    libfontconfig1 libatk1.0-0 libgdk-pixbuf2.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# noVNC + websockify (1.4 — works well over self-signed HTTPS)
RUN wget -qO- https://github.com/novnc/noVNC/archive/refs/tags/v1.4.0.tar.gz | tar xz -C /opt \
    && mv /opt/noVNC-1.4.0 /opt/noVNC \
    && wget -qO- https://github.com/novnc/websockify/archive/refs/tags/v0.11.0.tar.gz | tar xz -C /opt/noVNC/utils \
    && mv /opt/noVNC/utils/websockify-0.11.0 /opt/noVNC/utils/websockify \
    && ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html

RUN openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /opt/noVNC/self.pem -out /opt/noVNC/self.pem \
    -subj "/CN=pyongyang-racer"

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
COPY docker/start-vnc.sh /docker/start-vnc.sh
COPY docker/start-flash.sh /docker/start-flash.sh
COPY docker/supervisord.conf /etc/supervisor/conf.d/pyongyang.conf
RUN chmod +x /entrypoint.sh /docker/start-vnc.sh /docker/start-flash.sh

EXPOSE 6080

ENTRYPOINT ["/entrypoint.sh"]
