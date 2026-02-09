% main.m - Главный скрипт для цикличной обработки JSON-файлов по диапазону дат

% Параметры
data_dir = 'data';  % Основная директория с поддиректориями
processed_dir = 'processed_data';  % Директория для сохранения результатов

% Проверяем, существуют ли основные директории
if ~isfolder(data_dir)
    error('Директория %s не найдена.', data_dir);
end
if ~isfolder(processed_dir)
    mkdir(processed_dir); % Создаем директорию, если её нет
end

% Пользователь вводит название поддиректории
selected_subdir = input('Введите название поддиректории в папке data: ', 's');
selected_path = fullfile(data_dir, selected_subdir);

% Проверяем, существует ли поддиректория
if ~isfolder(selected_path)
    fprintf('Ошибка: Поддиректория %s не найдена в %s.\n', selected_subdir, data_dir);
    return;
end

% Получаем список всех JSON-файлов в поддиректории
json_files = dir(fullfile(selected_path, '*.json'));
json_names = {json_files.name};

if isempty(json_names)
    fprintf('Ошибка: В поддиректории %s нет JSON-файлов.\n', selected_subdir);
    return;
end

% Пользователь вводит JSON-файл начала сбора
json_start = input('Введите название JSON-файла начала сбора (например, 2025-01-16_13-47.json): ', 's');
if ~ismember(json_start, json_names)
    fprintf('Ошибка: Файл %s не найден в поддиректории %s.\n', json_start, selected_subdir);
    return;
end

% Пользователь вводит JSON-файл окончания сбора
json_end = input('Введите название JSON-файла окончания сбора (например, 2025-01-16_13-54.json): ', 's');
if ~ismember(json_end, json_names)
    fprintf('Ошибка: Файл %s не найден в поддиректории %s.\n', json_end, selected_subdir);
    return;
end

% Определяем диапазон файлов для обработки
start_idx = find(strcmp(json_names, json_start));
end_idx = find(strcmp(json_names, json_end));

% Проверяем порядок ввода
if start_idx > end_idx
    fprintf('Ошибка: Начальный JSON-файл должен быть раньше (по времени), чем конечный.\n');
    return;
end

% Путь для сохранения таблицы
output_file = fullfile(processed_dir, [selected_subdir, '.mat']);

% Запуск обработки в цикле
fprintf('Обработка JSON-файлов в диапазоне: %s -> %s\n', json_start, json_end);
for i = start_idx:end_idx
    json_file_path = fullfile(selected_path, json_names{i});
    fprintf('Обработка файла: %s\n', json_names{i});
    process_json_matlab(json_file_path, output_file);
end

fprintf('Обработка завершена. Таблица сохранена в %s.\n', output_file);

