# Pyongyang Racer — real Flash Player via noVNC (linux/amd64 for Oracle x86 VMs)
FROM --platform=linux/amd64 ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    SCREEN_WIDTH=800 \
    SCREEN_HEIGHT=600 \
    VNC_PASSWORD=pyongyang

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc fluxbox wget ca-certificates supervisor \
    libgtk2.0-0 libnss3 libxss1 libasound2 libdbus-glib-1-2 \
    libglu1-mesa libxi6 libxrender1 libxtst6 libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

# noVNC + websockify
RUN wget -qO- https://github.com/novnc/noVNC/archive/refs/tags/v1.5.0.tar.gz | tar xz -C /opt \
    && mv /opt/noVNC-1.5.0 /opt/noVNC \
    && wget -qO- https://github.com/novnc/websockify/archive/refs/tags/v0.12.0.tar.gz | tar xz -C /opt/noVNC/utils \
    && mv /opt/noVNC/utils/websockify-0.12.0 /opt/noVNC/utils/websockify \
    && ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html

# Adobe Flash Player standalone (Linux x86_64)
RUN mkdir -p /opt/flash \
    && wget -qO /tmp/flash.tar.gz \
      "https://github.com/Grubsic/Adobe-Flash-Player-Debug-Downloads-Archive/raw/main/Linux/flash_player_sa_linux.x86_64.tar.gz" \
    && tar xzf /tmp/flash.tar.gz -C /opt/flash \
    && chmod +x /opt/flash/flashplayer \
    && rm /tmp/flash.tar.gz

# Game files (JSON form required — source folder name contains a space)
COPY ["PY Racer_0509", "/game/pyongyang"]
COPY 1.dat common.dat sound.dat symbol.dat common.txt info.txt PreGame.mp3 /game/
COPY photo /game/photo

COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/start-vnc.sh /docker/start-vnc.sh
COPY docker/supervisord.conf /etc/supervisor/conf.d/pyongyang.conf
RUN chmod +x /entrypoint.sh /docker/start-vnc.sh

EXPOSE 6080

ENTRYPOINT ["/entrypoint.sh"]
