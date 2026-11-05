-- Empty database used by the `web-install` service to try out the installer.
CREATE DATABASE IF NOT EXISTS makestuff_install CHARACTER SET utf8mb4;
GRANT ALL PRIVILEGES ON makestuff_install.* TO 'makestuff'@'%';
