ARG PHP_VERSION=8.2
FROM php:${PHP_VERSION}-apache
RUN docker-php-ext-install pdo_mysql \
 && a2enmod rewrite headers \
 && sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf \
 && echo 'ServerName localhost' > /etc/apache2/conf-enabled/servername.conf \
 && printf 'upload_max_filesize=8M\npost_max_size=9M\n' > /usr/local/etc/php/conf.d/uploads.ini
WORKDIR /var/www/html
