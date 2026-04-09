import socket
import select
import threading

SOCKS_VERSION = 5

def handle_client(connection):
    # Basic socks5 handshake (no auth)
    version, nmethods = connection.recv(2)
    methods = connection.recv(nmethods)
    
    connection.sendall(bytes([SOCKS_VERSION, 0]))
    
    version, cmd, _, address_type = connection.recv(4)
    if address_type == 1:  # IPv4
        address = socket.inet_ntoa(connection.recv(4))
    elif address_type == 3:  # Domain name
        domain_length = connection.recv(1)[0]
        address = connection.recv(domain_length).decode('utf-8')
    port = int.from_bytes(connection.recv(2), 'big')

    print(f"SOCKS request to {address}:{port}")
    try:
        remote = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        remote.connect((address, port))
        bind_address = remote.getsockname()
        
        addr = int.from_bytes(socket.inet_aton(bind_address[0]), 'big')
        port = bind_address[1]
        
        reply = int.to_bytes(5, 1, 'big') + int.to_bytes(0, 1, 'big') + int.to_bytes(0, 1, 'big') + int.to_bytes(1, 1, 'big') + \
                int.to_bytes(addr, 4, 'big') + int.to_bytes(port, 2, 'big')
        
        connection.sendall(reply)
        
        # establish bi-directional tunnel
        if reply[1] == 0:
            sockets = [connection, remote]
            while True:
                readable, _, _ = select.select(sockets, [], [])
                if connection in readable:
                    data = connection.recv(4096)
                    if not data: break
                    remote.sendall(data)
                if remote in readable:
                    data = remote.recv(4096)
                    if not data: break
                    connection.sendall(data)
                    
    except Exception as e:
        print(f"Error connecting: {e}")
    finally:
        connection.close()

if __name__ == '__main__':
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 1080))
    s.listen(10)
    print("Basic SOCKS5 proxy listening on 127.0.0.1:1080")
    while True:
        conn, addr = s.accept()
        threading.Thread(target=handle_client, args=(conn,)).start()
