function process_json_matlab(json_file, mat_filename)
    % Функция для обработки JSON-файла и формирования таблицы
    % Аргумент:
    %    json_file - имя входного JSON-файла

    % Загружаем JSON
    json_text = fileread(json_file);
    data = jsondecode(json_text);
    
    % Получаем дату из имени файла
    [~, filename, ~] = fileparts(json_file);
    column_name = replace(filename, '_', '-'); % Используем дату как заголовок столбца
    

    % Если файл уже существует, загружаем таблицу
    if isfile(mat_filename)
        load(mat_filename, 'T');
        
        % Проверяем, есть ли уже такой столбец
        if any(strcmp(T.Properties.VariableNames, column_name))
            fprintf('Столбец %s уже существует, обработка прекращена.\n', column_name);
            return;
        end
    else
        % Создаем новую таблицу
        T = table();
    end

    % Получаем данные из payload
    payload = data.payload;
    
    % Создаем структуру для хранения данных
    params = struct();
    
    % Рекурсивная функция обработки payload
    function parse_payload(struct_data, prefix)
        fields_list = fieldnames(struct_data);
        
        for i = 1:length(fields_list)
            field_name = fields_list{i};
            field_value = struct_data.(field_name);
            
            % Формируем полное имя параметра
            if isempty(prefix)
                param_name = field_name;
            else
                param_name = sprintf('%s_%s', prefix, field_name);
            end
            
            % Если значение - структура, обрабатываем рекурсивно
            if isstruct(field_value)
                parse_payload(field_value, param_name);
            elseif iscell(field_value)
                % Если это массив значений (ячейки), обрабатываем их
                for j = 1:length(field_value)
                    param_sub_name = sprintf('%s_dop_%d', param_name, j);
                    params.(param_sub_name) = field_value{j};
                end
            else
                % Записываем значение в структуру params
                params.(param_name) = field_value;
            end
        end
    end

    % Запускаем обработку payload
    parse_payload(payload, '');

    % Конвертируем структуру в таблицу
    param_names = fieldnames(params);
    param_values = struct2cell(params);

    % Если параметров нет, завершаем работу
    if isempty(param_names)
        fprintf('Данные в payload отсутствуют, обработка завершена.\n');
        return;
    end

    % Создаем временную таблицу с новым столбцом
    new_data = table(param_values, 'VariableNames', {column_name}, 'RowNames', param_names);

    % Объединяем с основной таблицей (T), добавляя новые строки при необходимости
    if isempty(T)
        T = new_data;
    else
        % Находим все уникальные строки (параметры)
        all_rows = union(T.Properties.RowNames, new_data.Properties.RowNames);

        % Создаем пустые таблицы, если строки отсутствуют
        missing_T = table(NaN(length(setdiff(all_rows, T.Properties.RowNames)), width(T)), ...
                          'VariableNames', T.Properties.VariableNames, ...
                          'RowNames', setdiff(all_rows, T.Properties.RowNames));

        missing_new_data = table(NaN(length(setdiff(all_rows, new_data.Properties.RowNames)), width(new_data)), ...
                                 'VariableNames', new_data.Properties.VariableNames, ...
                                 'RowNames', setdiff(all_rows, new_data.Properties.RowNames));

        % Объединяем таблицы, чтобы у всех были одинаковые строки
        T = [T; missing_T];
        new_data = [new_data; missing_new_data];
        T = [T new_data];
    end

    % Сохраняем таблицу
    save(mat_filename, 'T');

    fprintf('Данные успешно добавлены в %s.\n', mat_filename);
end