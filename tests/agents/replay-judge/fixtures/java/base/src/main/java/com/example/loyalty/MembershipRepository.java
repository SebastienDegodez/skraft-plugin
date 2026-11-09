package com.example.loyalty;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Optional;

public final class MembershipRepository {

    private final String url;
    private final String user;
    private final String password;

    public MembershipRepository(String url, String user, String password) {
        this.url = url;
        this.user = user;
        this.password = password;
    }

    public void save(String memberId, MembershipStatus status) {
        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            connection.createStatement().execute(
                "create table if not exists membership (member_id varchar(16) primary key, status varchar(16) not null)");
            var insert = connection.prepareStatement("insert into membership (member_id, status) values (?, ?)");
            insert.setString(1, memberId);
            insert.setString(2, status.name());
            insert.executeUpdate();
        } catch (SQLException exception) {
            throw new IllegalStateException(exception);
        }
    }

    public Optional<MembershipStatus> statusOf(String memberId) {
        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            var select = connection.prepareStatement("select status from membership where member_id = ?");
            select.setString(1, memberId);
            var rows = select.executeQuery();
            return rows.next() ? Optional.of(MembershipStatus.valueOf(rows.getString(1))) : Optional.empty();
        } catch (SQLException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
